import { ORPCError } from "@orpc/server";
import { notifyOrgForReview } from "@repo/api/lib/notify-employee";
import {
	getUserEmployeeId,
	hasPermission,
	requirePermission,
	verifyTaskOwnership,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import {
	addonNoteFor,
	classifyAddonNote,
} from "../../installations/lib/addons";
import { taskDealerScopeWhere } from "../lib/dealer-scope";
import { TASK_RESOLUTION_CODES } from "../lib/resolutions";

// Installed equipment recorded when closing an INSTALLATION / REPLACEMENT task
// (or, optionally, a MAINTENANCE task). Each line becomes a PENDING Installation
// row that flows through the existing Installations approval queue. A line is
// either a physical stock item or an add-on (IPTV / Real IP), never both.
const installedItemSchema = z
	.object({
		stockItemId: z.string().optional(),
		addonType: z.enum(["IPTV", "REAL_IP"]).optional(),
		quantity: z.number().int().min(1).default(1),
		price: z.number().min(0).default(0),
		notes: z.string().max(500).optional(),
	})
	.refine((v) => Boolean(v.stockItemId) !== Boolean(v.addonType), {
		message: "Each line must be either a stock item or an add-on",
	});

// Free-typed item names were removed (owner request 2026-08-06): recovered
// equipment must reference a real stock item so quantities stay reconcilable.
const recoveredItemSchema = z.object({
	stockItemId: z.string(),
	quantity: z.number().int().min(1).default(1),
	// Photo evidence is mandatory for recovered equipment (legacy parity)
	pictureUrl: z.string().min(1).max(1000),
});

export const completeTaskWithEvidence = protectedProcedure
	.route({
		method: "POST",
		path: "/tasks/{taskId}/complete",
		tags: ["Tasks"],
		summary:
			"Complete a field task with evidence (maintenance resolution, installed items, and/or recovered equipment)",
	})
	.input(
		z
			.object({
				organizationId: z.string(),
				taskId: z.string(),
				// Maintenance / general branch
				resolutionCode: z.enum(TASK_RESOLUTION_CODES).optional(),
				resolutionNote: z.string().max(2000).optional(),
				// Task-level completion photo. Required for INSTALLATION /
				// REPLACEMENT (proof of the install); optional elsewhere.
				photoUrl: z.string().max(1000).optional(),
				// Install branch (INSTALLATION / REPLACEMENT, optional on MAINTENANCE)
				installedItems: z.array(installedItemSchema).max(20).optional(),
				// Uninstall branch (UNINSTALL / REPLACEMENT)
				recoveredItems: z.array(recoveredItemSchema).max(20).optional(),
			})
			.refine(
				(v) =>
					v.resolutionCode !== "custom" ||
					(v.resolutionNote && v.resolutionNote.length > 0),
				{ message: "A note is required for custom resolutions" },
			),
	)
	.handler(async ({ context: { user }, input }) => {
		const { permCtx, activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"tasks",
			"update",
		);

		const task = await db.task.findFirst({
			where: {
				id: input.taskId,
				organizationId: input.organizationId,
				...taskDealerScopeWhere(activeDealerId),
			},
			include: {
				assignments: { select: { employeeId: true } },
				customer: {
					select: { firstName: true, lastName: true, username: true },
				},
			},
		});
		if (!task) {
			throw new ORPCError("NOT_FOUND", { message: "Task not found" });
		}
		if (task.status === "COMPLETED" || task.status === "CANCELLED") {
			throw new ORPCError("CONFLICT", {
				message: "Task is already closed",
			});
		}
		if (task.status === "PENDING_APPROVAL") {
			throw new ORPCError("CONFLICT", {
				message: "Task completion is already awaiting admin approval",
			});
		}

		// Every completion needs an admin sign-off. Callers who hold the
		// approve permission are the approvers, so their own completions
		// close immediately; everyone else's go to PENDING_APPROVAL.
		const isApprover = hasPermission(permCtx, "tasks", "approve");

		const employeeId = await getUserEmployeeId(
			input.organizationId,
			user.id,
		);
		await verifyTaskOwnership(permCtx, "update", task, employeeId);

		const installedItems = input.installedItems ?? [];
		const recoveredItems = input.recoveredItems ?? [];

		// ── Per-category required-field rules ───────────────────────────
		const requiresInstall =
			task.category === "INSTALLATION" || task.category === "REPLACEMENT";
		const requiresRecovery =
			task.category === "UNINSTALL" || task.category === "REPLACEMENT";

		if (requiresInstall) {
			if (installedItems.length === 0) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Record at least one installed item",
				});
			}
			if (!input.photoUrl) {
				throw new ORPCError("BAD_REQUEST", {
					message: "A photo is required for this task",
				});
			}
			if (!task.customerId && !task.stationId && !task.baseId) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"This task must target a customer, station, or base to record an install",
				});
			}
			if (!employeeId) {
				throw new ORPCError("FORBIDDEN", {
					message: "Only a field employee can record installed items",
				});
			}
		}
		if (requiresRecovery && recoveredItems.length === 0) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Record at least one recovered item",
			});
		}
		// Maintenance / general tasks resolve via a canned resolution code
		if (!requiresInstall && !requiresRecovery && !input.resolutionCode) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Select what you found to complete this task",
			});
		}

		// Split installed lines: physical stock vs add-ons (IPTV / Real IP).
		const stockLines = installedItems.filter(
			(i): i is typeof i & { stockItemId: string } =>
				Boolean(i.stockItemId),
		);
		const addonLines = installedItems.filter(
			(i): i is typeof i & { addonType: "IPTV" | "REAL_IP" } =>
				Boolean(i.addonType),
		);

		// Soft stock check — advisory only; the hard guard runs at approval.
		// Add-on lines carry no stock, so they're excluded.
		if (stockLines.length > 0 && employeeId) {
			const allocations = await db.workerStock.findMany({
				where: {
					employeeId,
					stockItemId: {
						in: stockLines.map((i) => i.stockItemId),
					},
				},
				select: { stockItemId: true, quantity: true },
			});
			const holdings = new Map(
				allocations.map((a) => [a.stockItemId, a.quantity]),
			);
			for (const line of stockLines) {
				if ((holdings.get(line.stockItemId) ?? 0) < line.quantity) {
					throw new ORPCError("CONFLICT", {
						message:
							"You don't hold enough stock for one of the installed items — ask for a delivery first",
					});
				}
			}
		}

		// Add-ons attach to a customer and are capped at one IPTV + one Real IP.
		if (addonLines.length > 0) {
			if (!task.customerId) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Add-ons can only be recorded for a customer task",
				});
			}
			const requested = addonLines.map((l) => l.addonType);
			if (new Set(requested).size !== requested.length) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Only one of each add-on type per task",
				});
			}
			const existingAddons = await db.installation.findMany({
				where: {
					organizationId: input.organizationId,
					customerId: task.customerId,
					isAddOn: true,
					status: { in: ["PENDING", "APPROVED"] },
				},
				select: { notes: true },
			});
			const existingTypes = new Set(
				existingAddons
					.map((a) => classifyAddonNote(a.notes))
					.filter(Boolean),
			);
			for (const type of requested) {
				if (existingTypes.has(type)) {
					throw new ORPCError("CONFLICT", {
						message: `Customer already has ${addonNoteFor(type)}`,
					});
				}
			}
		}

		// Hardware prices are admin-controlled: non-approver submissions always
		// get the item's current sellPrice, whatever the client sent (same rule
		// as installations.create and customers.workerCreate). Add-on prices
		// stay caller-set (per-customer deals).
		const canSetInstallPrice = hasPermission(
			permCtx,
			"installations",
			"approve",
		);
		const sellPriceByStockItem = new Map<string, number>();
		if (!canSetInstallPrice) {
			const installedStockIds = [
				...new Set(
					installedItems
						.map((i) => i.stockItemId)
						.filter((id): id is string => Boolean(id)),
				),
			];
			if (installedStockIds.length > 0) {
				const priced = await db.stockItem.findMany({
					where: {
						id: { in: installedStockIds },
						organizationId: input.organizationId,
					},
					select: { id: true, sellPrice: true },
				});
				for (const item of priced) {
					sellPriceByStockItem.set(item.id, item.sellPrice);
				}
			}
		}

		// Resolve stock item names for recovered items submitted by id
		const stockItemIds = recoveredItems
			.map((i) => i.stockItemId)
			.filter((id): id is string => Boolean(id));
		const stockItems = stockItemIds.length
			? await db.stockItem.findMany({
					where: {
						id: { in: stockItemIds },
						organizationId: input.organizationId,
					},
					select: { id: true, name: true },
				})
			: [];
		const stockItemNames = new Map(stockItems.map((s) => [s.id, s.name]));

		// Every recorded install must carry a target. INSTALLATION / REPLACEMENT
		// tasks are already guarded above; this catches other categories
		// (e.g. MAINTENANCE) that may also submit installed items.
		if (
			installedItems.length > 0 &&
			!task.customerId &&
			!task.stationId &&
			!task.baseId
		) {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"This task must target a customer, station, or base to record installed items",
			});
		}

		const updated = await db.$transaction(async (tx) => {
			if (installedItems.length > 0 && employeeId) {
				await tx.installation.createMany({
					data: installedItems.map((line) => ({
						organizationId: input.organizationId,
						taskId: task.id,
						// Add-ons attach to the customer; clear station/base.
						customerId: task.customerId,
						stationId: line.addonType ? null : task.stationId,
						baseId: line.addonType ? null : task.baseId,
						employeeId,
						stockItemId: line.stockItemId ?? null,
						quantity: line.addonType ? 1 : line.quantity,
						price:
							line.stockItemId && !canSetInstallPrice
								? (sellPriceByStockItem.get(line.stockItemId) ??
									0)
								: line.price,
						isAddOn: Boolean(line.addonType),
						notes: line.addonType
							? addonNoteFor(line.addonType)
							: (line.notes ?? null),
					})),
				});
			}

			if (recoveredItems.length > 0) {
				await tx.uninstalledItem.createMany({
					data: recoveredItems.map((item) => ({
						organizationId: input.organizationId,
						taskId: task.id,
						stockItemId: item.stockItemId,
						itemName:
							stockItemNames.get(item.stockItemId) ?? "Unknown",
						quantity: item.quantity,
						pictureUrl: item.pictureUrl,
						employeeId,
					})),
				});
			}

			return tx.task.update({
				where: { id: task.id },
				data: {
					status: isApprover ? "COMPLETED" : "PENDING_APPROVAL",
					// Field-work timestamp; approval only flips the status.
					completedAt: new Date(),
					completedByEmployeeId: employeeId,
					resolutionCode: input.resolutionCode ?? null,
					resolutionNote: input.resolutionNote ?? null,
					completionPhotoUrl: input.photoUrl ?? null,
				},
				select: {
					id: true,
					status: true,
					completedAt: true,
					resolutionCode: true,
				},
			});
		});

		const customerName = task.customer
			? [task.customer.firstName, task.customer.lastName]
					.filter(Boolean)
					.join(" ") || task.customer.username
			: null;
		const org = await db.organization.findFirst({
			where: { id: input.organizationId },
			select: { slug: true },
		});
		const hasInstalls = installedItems.length > 0;
		const hasRecovery = recoveredItems.length > 0;
		const evidenceParts = [
			hasInstalls ? `${installedItems.length} installed item(s)` : null,
			hasRecovery ? `${recoveredItems.length} recovered item(s)` : null,
		].filter(Boolean);
		notifyOrgForReview({
			organizationId: input.organizationId,
			title: !isApprover
				? "Task completion to approve"
				: hasInstalls || hasRecovery
					? "Field work to approve"
					: "Task completed",
			message: `"${task.title}"${customerName ? ` for ${customerName}` : ""} was completed${evidenceParts.length > 0 ? ` with ${evidenceParts.join(" and ")}` : ""}${!isApprover ? " — awaiting your approval" : ""}`,
			// The task page carries the approve/reject actions; installs are
			// reviewed on their own queue once the task itself is approved.
			link: !isApprover
				? `/app/${org?.slug ?? ""}/tasks/${task.id}`
				: hasInstalls
					? `/app/${org?.slug ?? ""}/installations`
					: `/app/${org?.slug ?? ""}/tasks/${task.id}`,
			excludeUserIds: [user.id],
			type:
				!isApprover || hasInstalls || hasRecovery ? "warning" : "info",
		}).catch((err: unknown) =>
			logger.warn("[Task Complete] notify failed", {
				error: String(err),
			}),
		);

		return { task: updated };
	});
