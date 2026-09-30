import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const listStockItems = protectedProcedure
	.route({
		method: "GET",
		path: "/stock/items",
		tags: ["Stock"],
		summary: "List stock items with worker allocation totals",
	})
	.input(
		z.object({
			organizationId: z.string(),
			search: z.string().optional(),
			lowStockOnly: z.boolean().optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"inventory",
			"read",
		);

		const where: Record<string, unknown> = {
			organizationId: input.organizationId,
		};
		if (input.search) {
			where["name"] = { contains: input.search, mode: "insensitive" };
		}

		const items = await db.stockItem.findMany({
			where,
			include: {
				workerAllocations: {
					where: { quantity: { gt: 0 } },
					select: {
						id: true,
						quantity: true,
						unitPrice: true,
						employee: { select: { id: true, name: true } },
					},
				},
				suppliers: {
					select: {
						supplier: {
							select: { id: true, name: true, phones: true },
						},
					},
				},
				// Newest delivery, for "last received from X on …".
				logs: {
					where: { action: "ADD", supplierId: { not: null } },
					orderBy: { createdAt: "desc" },
					take: 1,
					select: {
						createdAt: true,
						quantity: true,
						supplier: { select: { id: true, name: true } },
					},
				},
			},
			orderBy: { name: "asc" },
		});

		const mapped = items.map((item) => ({
			id: item.id,
			name: item.name,
			quantity: item.quantity,
			costPrice: item.costPrice,
			sellPrice: item.sellPrice,
			alertThreshold: item.alertThreshold,
			alertEnabled: item.alertEnabled,
			showInUninstall: item.showInUninstall,
			createdAt: item.createdAt,
			suppliers: item.suppliers.map((s) => s.supplier),
			lastDelivery: item.logs[0]
				? {
						at: item.logs[0].createdAt,
						quantity: item.logs[0].quantity,
						supplierId: item.logs[0].supplier?.id ?? null,
						supplierName: item.logs[0].supplier?.name ?? null,
					}
				: null,
			workerQuantity: item.workerAllocations.reduce(
				(sum, a) => sum + a.quantity,
				0,
			),
			workerAllocations: item.workerAllocations,
			isLowStock:
				item.alertEnabled &&
				item.alertThreshold !== null &&
				item.quantity <= item.alertThreshold,
		}));

		const filtered = input.lowStockOnly
			? mapped.filter((i) => i.isLowStock)
			: mapped;

		return { items: filtered, total: filtered.length };
	});
