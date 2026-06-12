import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

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
		await requirePermission(
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

			const allocation = await tx.workerStock.findUnique({
				where: {
					stockItemId_employeeId: {
						stockItemId: stockItem.id,
						employeeId: input.employeeId,
					},
				},
				select: { id: true, quantity: true },
			});
			if (!allocation || allocation.quantity < input.quantity) {
				throw new ORPCError("CONFLICT", {
					message: `Worker only holds ${allocation?.quantity ?? 0} — cannot return ${input.quantity}`,
				});
			}

			await tx.workerStock.update({
				where: { id: allocation.id },
				data: { quantity: { decrement: input.quantity } },
			});

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
					workerQtyBefore: allocation.quantity,
					workerQtyAfter: allocation.quantity - input.quantity,
					notes: input.notes ?? null,
				},
			});

			return updated;
		});

		return { item };
	});
