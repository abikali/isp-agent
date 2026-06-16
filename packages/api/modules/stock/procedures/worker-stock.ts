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

		const allocations = await db.workerStock.findMany({
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
		});

		return {
			employeeId,
			allocations,
			totalValue: allocations.reduce(
				(sum, a) => sum + a.quantity * a.unitPrice,
				0,
			),
		};
	});
