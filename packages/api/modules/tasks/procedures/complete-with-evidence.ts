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
import { TASK_RESOLUTION_CODES } from "../lib/resolutions";

const uninstalledItemSchema = z
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
			"Complete a field task with evidence (maintenance resolution or recovered items)",
	})
	.input(
		z
			.object({
				organizationId: z.string(),
				taskId: z.string(),
				// Maintenance branch
				resolutionCode: z.enum(TASK_RESOLUTION_CODES).optional(),
				resolutionNote: z.string().max(2000).optional(),
				photoUrl: z.string().max(1000).optional(),
				// Uninstall branch
				items: z.array(uninstalledItemSchema).max(20).optional(),
			})
			.refine(
				(v) =>
					v.resolutionCode !== "custom" ||
					(v.resolutionNote && v.resolutionNote.length > 0),
				{ message: "A note is required for custom resolutions" },
			)
			.refine(
				(v) => v.resolutionCode || (v.items && v.items.length > 0),
				{
					message:
						"Provide a resolution (maintenance) or recovered items (uninstall)",
				},
			),
	)
	.handler(async ({ context: { user }, input }) => {
		const { permCtx } = await requirePermission(
			input.organizationId,
			user.id,
			"tasks",
			"update",
		);

		const task = await db.task.findFirst({
			where: { id: input.taskId, organizationId: input.organizationId },
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

		// Resolve stock item names for recovered items submitted by id
		const items = input.items ?? [];
		const stockItemIds = items
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
			if (items.length > 0) {
				await tx.uninstalledItem.createMany({
					data: items.map((item) => ({
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
		notifyOrgForReview({
			organizationId: input.organizationId,
			title:
				items.length > 0
					? "Recovered equipment to review"
					: "Task completed",
			message: `"${task.title}"${customerName ? ` for ${customerName}` : ""} was completed${items.length > 0 ? ` with ${items.length} recovered item(s)` : ""}`,
			link: `/app/${org?.slug ?? ""}/tasks/${task.id}`,
			excludeUserIds: [user.id],
			type: items.length > 0 ? "warning" : "info",
		}).catch((err: unknown) =>
			logger.warn("[Task Complete] notify failed", {
				error: String(err),
			}),
		);

		return { task: updated };
	});
