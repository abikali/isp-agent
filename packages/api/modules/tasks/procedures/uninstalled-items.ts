import { ORPCError } from "@orpc/server";
import { notifyFieldEmployee } from "@repo/api/lib/notify-employee";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { bilingual, tgMessage } from "@repo/utils";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { bustTaskStats } from "../lib/stats-cache";
import { approveUninstalledItemInTx } from "../lib/uninstalled-review";

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

		if (input.action === "deny") {
			const updated = await db.uninstalledItem.update({
				where: { id: item.id },
				data: {
					status: "DENIED",
					reviewedById: user.id,
					reviewedAt: new Date(),
				},
			});
			bustTaskStats(input.organizationId);
			if (item.employeeId) {
				notifyFieldEmployee({
					organizationId: input.organizationId,
					employeeId: item.employeeId,
					title: bilingual(
						"Recovered item denied",
						"تم رفض غرض تم فكه",
					),
					message: bilingual(
						`${item.itemName} ×${item.quantity} was denied`,
						`تم رفض ${item.itemName} ×${item.quantity}`,
					),
					type: "warning",
					telegramText: tgMessage({
						icon: "⛔",
						title: bilingual(
							"Recovered item denied",
							"تم رفض غرض تم فكه",
						),
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

		const {
			item: updated,
			stockItem: matchedStockItem,
			quantity,
		} = await db.$transaction((tx) =>
			approveUninstalledItemInTx(tx, item, {
				userId: user.id,
				quantity: input.quantity,
				itemName: input.itemName,
				unitPrice: input.unitPrice,
			}),
		);
		bustTaskStats(input.organizationId);

		if (item.employeeId) {
			notifyFieldEmployee({
				organizationId: input.organizationId,
				employeeId: item.employeeId,
				title: bilingual(
					"Recovered item approved",
					"تمت الموافقة على غرض تم فكه",
				),
				message: bilingual(
					`${matchedStockItem.name} ×${quantity} added to your stock`,
					`أُضيف ${matchedStockItem.name} ×${quantity} إلى مخزونك`,
				),
				type: "success",
				telegramText: tgMessage({
					icon: "✅",
					title: bilingual(
						"Recovered item approved",
						"تمت الموافقة على غرض تم فكه",
					),
					fields: [
						{
							icon: "🧰",
							value: `${matchedStockItem.name} ×${quantity}`,
						},
						{
							icon: "📥",
							value: bilingual(
								"Added to your stock",
								"أُضيف إلى مخزونك",
							),
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
