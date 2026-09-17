import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import {
	assertStockAvailable,
	decrementWorkerStock,
} from "../../installations/lib/stock-guard";

export const returnStockFromWorker = protectedProcedure
	.route({
		method: "POST",
		path: "/stock/items/{id}/return",
		tags: ["Stock"],
		summary: "Return stock from a worker back to admin inventory",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
			employeeId: z.string(),
			quantity: z.number().int().min(1),
			notes: z.string().max(500).optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"inventory",
			"update",
		);

		const item = await db.$transaction(async (tx) => {
			const stockItem = await tx.stockItem.findFirst({
				where: { id: input.id, organizationId: input.organizationId },
				select: { id: true, name: true },
			});
			if (!stockItem) {
				throw new ORPCError("NOT_FOUND", {
					message: "Stock item not found",
				});
			}

			// Scope the worker to the active dealer so stock can't be returned
			// from another dealer's employee by id.
			const employee = await tx.employee.findFirst({
				where: {
					id: input.employeeId,
					organizationId: input.organizationId,
					...getDealerScopeFilter(activeDealerId),
				},
				select: { id: true },
			});
			if (!employee) {
				throw new ORPCError("NOT_FOUND", {
					message: "Employee not found",
				});
			}

			// Never take back units the worker has already committed to
			// pending install lines or refund requests.
			await assertStockAvailable(tx, {
				employeeId: input.employeeId,
				lines: [
					{ stockItemId: stockItem.id, quantity: input.quantity },
				],
				reserve: true,
				audience: "admin",
				hint: "Review their pending installs and refunds first.",
			});
			const moved = await decrementWorkerStock(tx, {
				stockItemId: stockItem.id,
				employeeId: input.employeeId,
				quantity: input.quantity,
			});
			if (!moved) {
				throw new ORPCError("CONFLICT", {
					message: `Worker no longer holds ${input.quantity} × ${stockItem.name}`,
				});
			}

			const updated = await tx.stockItem.update({
				where: { id: stockItem.id },
				data: { quantity: { increment: input.quantity } },
			});

			await tx.stockLog.create({
				data: {
					organizationId: input.organizationId,
					stockItemId: stockItem.id,
					employeeId: input.employeeId,
					performedById: user.id,
					action: "TRANSFER_FROM_WORKER",
					itemName: stockItem.name,
					quantity: input.quantity,
					adminQtyBefore: updated.quantity - input.quantity,
					adminQtyAfter: updated.quantity,
					workerQtyBefore: moved.before,
					workerQtyAfter: moved.after,
					notes: input.notes ?? null,
				},
			});

			return updated;
		});

		return { item };
	});
