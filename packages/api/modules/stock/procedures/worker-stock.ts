import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	getUserEmployeeId,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const getWorkerStockByEmployee = protectedProcedure
	.route({
		method: "GET",
		path: "/stock/worker/{employeeId}",
		tags: ["Stock"],
		summary: "Get a worker's stock allocations (admin view)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			employeeId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"inventory",
			"read",
		);

		const allocations = await db.workerStock.findMany({
			where: {
				employeeId: input.employeeId,
				quantity: { gt: 0 },
				stockItem: { organizationId: input.organizationId },
				employee: getDealerScopeFilter(activeDealerId),
			},
			include: {
				stockItem: {
					select: { id: true, name: true, sellPrice: true },
				},
			},
			orderBy: { stockItem: { name: "asc" } },
		});

		return {
			allocations,
			totalValue: allocations.reduce(
				(sum, a) => sum + a.quantity * a.unitPrice,
				0,
			),
		};
	});

export const getMyStock = protectedProcedure
	.route({
		method: "GET",
		path: "/stock/my",
		tags: ["Stock"],
		summary: "Get the current user's worker stock",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"inventory",
			"read",
		);

		const employeeId = await getUserEmployeeId(
			input.organizationId,
			user.id,
		);
		if (!employeeId) {
			throw new ORPCError("FORBIDDEN", {
				message: "No employee record linked to your account",
			});
		}

		const [allocations, pendingRefunds, pendingInstalls] =
			await Promise.all([
				db.workerStock.findMany({
					where: {
						employeeId,
						quantity: { gt: 0 },
						stockItem: { organizationId: input.organizationId },
					},
					include: {
						stockItem: {
							select: { id: true, name: true, sellPrice: true },
						},
					},
					orderBy: { stockItem: { name: "asc" } },
				}),
				db.stockRefundRequest.groupBy({
					by: ["stockItemId"],
					where: {
						organizationId: input.organizationId,
						employeeId,
						status: "PENDING",
					},
					_sum: { quantity: true },
				}),
				// Same reservation rule as the server-side stock guard: native
				// physical lines still awaiting approval.
				db.installation.groupBy({
					by: ["stockItemId"],
					where: {
						organizationId: input.organizationId,
						employeeId,
						status: "PENDING",
						isAddOn: false,
						externalBillingId: null,
						stockItemId: { not: null },
					},
					_sum: { quantity: true },
				}),
			]);

		// Map of stockItemId → quantity already awaiting refund approval, so the
		// worker UI can show pending state and cap further refund requests.
		const pendingRefundByItem: Record<string, number> = {};
		for (const row of pendingRefunds) {
			pendingRefundByItem[row.stockItemId] = row._sum.quantity ?? 0;
		}

		// stockItemId → quantity on pending install lines. The worker can only
		// commit held − pending installs − pending refunds.
		const pendingInstallByItem: Record<string, number> = {};
		for (const row of pendingInstalls) {
			if (row.stockItemId) {
				pendingInstallByItem[row.stockItemId] = row._sum.quantity ?? 0;
			}
		}

		return {
			employeeId,
			allocations,
			pendingRefundByItem,
			pendingInstallByItem,
			totalValue: allocations.reduce(
				(sum, a) => sum + a.quantity * a.unitPrice,
				0,
			),
		};
	});
