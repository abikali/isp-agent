import { ORPCError } from "@orpc/server";
import { notifyOrgForReview } from "@repo/api/lib/notify-employee";
import {
	getUserEmployeeId,
	requirePermission,
	verifyTaskOwnership,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { taskDealerScopeWhere } from "../lib/dealer-scope";
import { TASK_RESOLUTION_CODES } from "../lib/resolutions";

// Installed equipment recorded when closing an INSTALLATION / REPLACEMENT task
// (or, optionally, a MAINTENANCE task). Each line becomes a PENDING Installation
// row that flows through the existing Installations approval queue.
const installedItemSchema = z.object({
	stockItemId: z.string(),
	quantity: z.number().int().min(1).default(1),
	price: z.number().min(0).default(0),
	notes: z.string().max(500).optional(),
});

const recoveredItemSchema = z
	.object({
		stockItemId: z.string().optional(),
		itemName: z.string().max(255).optional(),
		quantity: z.number().int().min(1).default(1),
		// Photo evidence is mandatory for recovered equipment (legacy parity)
		pictureUrl: z.string().min(1).max(1000),
	})
	.refine((v) => v.stockItemId || v.itemName, {
		message: "Each recovered item needs a stock item or a name",
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
			if (!task.customerId && !task.stationId) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"This task must target a customer or station to record an install",
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

		// Soft stock check — advisory only; the hard guard runs at approval
		if (installedItems.length > 0 && employeeId) {
			const allocations = await db.workerStock.findMany({
				where: {
					employeeId,
					stockItemId: {
						in: installedItems.map((i) => i.stockItemId),
					},
				},
				select: { stockItemId: true, quantity: true },
			});
			const holdings = new Map(
				allocations.map((a) => [a.stockItemId, a.quantity]),
			);
			for (const line of installedItems) {
				if ((holdings.get(line.stockItemId) ?? 0) < line.quantity) {
					throw new ORPCError("CONFLICT", {
						message:
							"You don't hold enough stock for one of the installed items — ask for a delivery first",
					});
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

		const updated = await db.$transaction(async (tx) => {
			if (installedItems.length > 0 && employeeId) {
				await tx.installation.createMany({
					data: installedItems.map((line) => ({
						organizationId: input.organizationId,
						taskId: task.id,
						customerId: task.customerId,
						stationId: task.stationId,
						employeeId,
						stockItemId: line.stockItemId,
						quantity: line.quantity,
						price: line.price,
						isAddOn: false,
						notes: line.notes ?? null,
					})),
				});
			}

			if (recoveredItems.length > 0) {
				await tx.uninstalledItem.createMany({
					data: recoveredItems.map((item) => ({
						organizationId: input.organizationId,
						taskId: task.id,
						stockItemId: item.stockItemId ?? null,
						itemName: item.stockItemId
							? (stockItemNames.get(item.stockItemId) ??
								(item.itemName as string) ??
								"Unknown")
							: (item.itemName as string),
						quantity: item.quantity,
						pictureUrl: item.pictureUrl,
						employeeId,
					})),
				});
			}

			return tx.task.update({
				where: { id: task.id },
				data: {
					status: "COMPLETED",
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
			title:
				hasInstalls || hasRecovery
					? "Field work to approve"
					: "Task completed",
			message: `"${task.title}"${customerName ? ` for ${customerName}` : ""} was completed${evidenceParts.length > 0 ? ` with ${evidenceParts.join(" and ")}` : ""}`,
			link: hasInstalls
				? `/app/${org?.slug ?? ""}/installations`
				: `/app/${org?.slug ?? ""}/tasks/${task.id}`,
			excludeUserIds: [user.id],
			type: hasInstalls || hasRecovery ? "warning" : "info",
		}).catch((err: unknown) =>
			logger.warn("[Task Complete] notify failed", {
				error: String(err),
			}),
		);

		return { task: updated };
	});
