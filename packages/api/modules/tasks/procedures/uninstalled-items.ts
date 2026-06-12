import { ORPCError } from "@orpc/server";
import { notifyFieldEmployee } from "@repo/api/lib/notify-employee";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const listUninstalledItems = protectedProcedure
	.route({
		method: "GET",
		path: "/tasks/uninstalled-items",
		tags: ["Tasks"],
		summary: "List recovered equipment submissions",
	})
	.input(
		z.object({
			organizationId: z.string(),
			status: z
				.enum(["PENDING", "APPROVED", "COMPLETED", "DENIED"])
				.optional(),
			taskId: z.string().optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(10).max(100).default(25),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(input.organizationId, user.id, "tasks", "read");

		const where: Record<string, unknown> = {
			organizationId: input.organizationId,
		};
		if (input.status) {
			where["status"] = input.status;
		}
		if (input.taskId) {
			where["taskId"] = input.taskId;
		}

		const [items, total] = await Promise.all([
			db.uninstalledItem.findMany({
				where,
				include: {
					stockItem: { select: { id: true, name: true } },
					task: {
						select: {
							id: true,
							title: true,
							customer: {
								select: {
									id: true,
									firstName: true,
									lastName: true,
									username: true,
								},
							},
							completedByEmployee: {
								select: { id: true, name: true },
							},
						},
					},
					reviewedBy: { select: { id: true, name: true } },
				},
				orderBy: { uninstalledAt: "desc" },
				skip: (input.page - 1) * input.pageSize,
				take: input.pageSize,
			}),
			db.uninstalledItem.count({ where }),
		]);

		return {
			items,
			total,
			page: input.page,
			pageSize: input.pageSize,
			totalPages: Math.ceil(total / input.pageSize),
		};
	});

export const reviewUninstalledItem = protectedProcedure
	.route({
		method: "POST",
		path: "/tasks/uninstalled-items/{id}/review",
		tags: ["Tasks"],
		summary:
			"Approve (auto-returns to admin stock) or deny a recovered item",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
			action: z.enum(["approve", "deny"]),
			quantity: z.number().int().min(1).optional(),
			// Admin can correct a typo'd item name before approving
			itemName: z.string().min(1).max(255).optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"installations",
			"approve",
		);

		const item = await db.uninstalledItem.findFirst({
			where: {
				id: input.id,
				organizationId: input.organizationId,
				status: "PENDING",
			},
		});
		if (!item) {
			throw new ORPCError("NOT_FOUND", {
				message: "Recovered item not found or already reviewed",
			});
		}

		const quantity = input.quantity ?? item.quantity;
		const itemName = input.itemName?.trim() || item.itemName;

		if (input.action === "deny") {
			const updated = await db.uninstalledItem.update({
				where: { id: item.id },
				data: {
					status: "DENIED",
					reviewedById: user.id,
					reviewedAt: new Date(),
				},
			});
			if (item.employeeId) {
				notifyFieldEmployee({
					organizationId: input.organizationId,
					employeeId: item.employeeId,
					title: "Recovered item denied",
					message: `${item.itemName} ×${item.quantity} was denied`,
					type: "warning",
				}).catch((err: unknown) =>
					logger.warn("[Uninstalled Review] notify failed", {
						error: String(err),
					}),
				);
			}
			return { item: updated };
		}

		// Approve: resolve the stock item. An explicit name correction takes
		// precedence over the original stockItemId link.
		let stockItem =
			item.stockItemId && !input.itemName
				? await db.stockItem.findFirst({
						where: {
							id: item.stockItemId,
							organizationId: input.organizationId,
						},
						select: { id: true, name: true },
					})
				: null;
		if (!stockItem) {
			stockItem = await db.stockItem.findFirst({
				where: {
					organizationId: input.organizationId,
					name: { equals: itemName, mode: "insensitive" },
				},
				select: { id: true, name: true },
			});
		}
		if (!stockItem) {
			throw new ORPCError("BAD_REQUEST", {
				message: `No stock item matches "${itemName}" — create it in Stock first, then approve`,
			});
		}
		const matchedStockItem = stockItem;

		const updated = await db.$transaction(async (tx) => {
			const stockUpdated = await tx.stockItem.update({
				where: { id: matchedStockItem.id },
				data: { quantity: { increment: quantity } },
			});
			await tx.stockLog.create({
				data: {
					organizationId: input.organizationId,
					stockItemId: matchedStockItem.id,
					employeeId: item.employeeId,
					performedById: user.id,
					action: "TRANSFER_FROM_WORKER",
					itemName: matchedStockItem.name,
					quantity,
					adminQtyBefore: stockUpdated.quantity - quantity,
					adminQtyAfter: stockUpdated.quantity,
					notes: `Recovered equipment approved (item ${item.id})`,
				},
			});
			return tx.uninstalledItem.update({
				where: { id: item.id },
				data: {
					status: "APPROVED",
					quantity,
					itemName: matchedStockItem.name,
					stockItemId: matchedStockItem.id,
					reviewedById: user.id,
					reviewedAt: new Date(),
				},
			});
		});

		if (item.employeeId) {
			notifyFieldEmployee({
				organizationId: input.organizationId,
				employeeId: item.employeeId,
				title: "Recovered item approved",
				message: `${matchedStockItem.name} ×${quantity} returned to stock`,
				type: "success",
			}).catch((err: unknown) =>
				logger.warn("[Uninstalled Review] notify failed", {
					error: String(err),
				}),
			);
		}

		return { item: updated };
	});
