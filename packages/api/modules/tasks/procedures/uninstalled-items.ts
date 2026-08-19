import { ORPCError } from "@orpc/server";
import { notifyFieldEmployee } from "@repo/api/lib/notify-employee";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { tgMessage } from "@repo/utils";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

/**
 * Recovered items anchor to a task (→ customer) for dealer scope. Items with
 * no task or a customer-less task are org-level and stay visible everywhere.
 */
export function uninstalledItemDealerScope(activeDealerId: string | null) {
	return {
		OR: [
			{ taskId: null },
			{ task: { customerId: null } },
			{ task: { customer: getDealerScopeFilter(activeDealerId) } },
		],
	};
}

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
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"tasks",
			"read",
		);

		const where: Record<string, unknown> = {
			organizationId: input.organizationId,
			AND: [uninstalledItemDealerScope(activeDealerId)],
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
					stockItem: {
						select: { id: true, name: true, sellPrice: true },
					},
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
			"Approve (credits the recovering worker's stock) or deny a recovered item",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
			action: z.enum(["approve", "deny"]),
			quantity: z.number().int().min(1).optional(),
			// Admin can correct a typo'd item name before approving
			itemName: z.string().min(1).max(255).optional(),
			// Value per unit at which the recovered gear enters the worker's
			// stock (defaults to the stock item's sellPrice). 0 = the company
			// covers it — the worker's accountable stock value doesn't grow.
			unitPrice: z.number().min(0).optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
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
				...uninstalledItemDealerScope(activeDealerId),
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
					telegramText: tgMessage({
						icon: "⛔",
						title: "Recovered item denied",
						fields: [
							{
								icon: "🧰",
								value: `${item.itemName} ×${item.quantity}`,
							},
						],
					}),
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
						select: { id: true, name: true, sellPrice: true },
					})
				: null;
		if (!stockItem) {
			stockItem = await db.stockItem.findFirst({
				where: {
					organizationId: input.organizationId,
					name: { equals: itemName, mode: "insensitive" },
				},
				select: { id: true, name: true, sellPrice: true },
			});
		}
		if (!stockItem) {
			throw new ORPCError("BAD_REQUEST", {
				message: `No stock item matches "${itemName}" — create it in Stock first, then approve`,
			});
		}
		const matchedStockItem = stockItem;

		// The recovering worker physically holds the gear, so approval credits
		// THEIR stock. Legacy synced rows carry no employee — fall back to the
		// central admin warehouse so those still resolve.
		const recoveringEmployeeId = item.employeeId;

		const unitPrice = input.unitPrice ?? matchedStockItem.sellPrice;

		const updated = await db.$transaction(async (tx) => {
			if (recoveringEmployeeId) {
				const existing = await tx.workerStock.findUnique({
					where: {
						stockItemId_employeeId: {
							stockItemId: matchedStockItem.id,
							employeeId: recoveringEmployeeId,
						},
					},
					select: { quantity: true, unitPrice: true },
				});
				const workerBefore = existing?.quantity ?? 0;
				// WorkerStock carries one price per (item, worker), but the
				// worker's accountable value is quantity × unitPrice — so blend
				// the recovered units in at the reviewed price via a weighted
				// average. Existing holdings keep their value; the total grows
				// by exactly quantity × unitPrice (0 when the company covers
				// the recovered gear).
				const blendedUnitPrice =
					Math.round(
						((workerBefore * (existing?.unitPrice ?? 0) +
							quantity * unitPrice) /
							(workerBefore + quantity)) *
							100,
					) / 100;
				await tx.workerStock.upsert({
					where: {
						stockItemId_employeeId: {
							stockItemId: matchedStockItem.id,
							employeeId: recoveringEmployeeId,
						},
					},
					create: {
						stockItemId: matchedStockItem.id,
						employeeId: recoveringEmployeeId,
						quantity,
						unitPrice,
					},
					update: {
						quantity: { increment: quantity },
						unitPrice: blendedUnitPrice,
					},
				});
				await tx.stockLog.create({
					data: {
						organizationId: input.organizationId,
						stockItemId: matchedStockItem.id,
						employeeId: recoveringEmployeeId,
						performedById: user.id,
						action: "TRANSFER_TO_WORKER",
						itemName: matchedStockItem.name,
						quantity,
						workerQtyBefore: workerBefore,
						workerQtyAfter: workerBefore + quantity,
						notes: `Recovered equipment approved (item ${item.id}) at $${unitPrice}/unit`,
					},
				});
			} else {
				const stockUpdated = await tx.stockItem.update({
					where: { id: matchedStockItem.id },
					data: { quantity: { increment: quantity } },
				});
				await tx.stockLog.create({
					data: {
						organizationId: input.organizationId,
						stockItemId: matchedStockItem.id,
						employeeId: null,
						performedById: user.id,
						action: "TRANSFER_FROM_WORKER",
						itemName: matchedStockItem.name,
						quantity,
						adminQtyBefore: stockUpdated.quantity - quantity,
						adminQtyAfter: stockUpdated.quantity,
						notes: `Recovered equipment approved (item ${item.id})`,
					},
				});
			}
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
				message: `${matchedStockItem.name} ×${quantity} added to your stock`,
				type: "success",
				telegramText: tgMessage({
					icon: "✅",
					title: "Recovered item approved",
					fields: [
						{
							icon: "🧰",
							value: `${matchedStockItem.name} ×${quantity}`,
						},
						{
							icon: "📥",
							value: "Added to your stock",
						},
					],
				}),
			}).catch((err: unknown) =>
				logger.warn("[Uninstalled Review] notify failed", {
					error: String(err),
				}),
			);
		}

		return { item: updated };
	});
