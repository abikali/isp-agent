import { ORPCError } from "@orpc/server";
import {
	notifyFieldEmployee,
	notifyOrgForReview,
} from "@repo/api/lib/notify-employee";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const deliverStockToWorker = protectedProcedure
	.route({
		method: "POST",
		path: "/stock/items/{id}/deliver",
		tags: ["Stock"],
		summary: "Deliver stock from admin inventory to a worker",
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

		const employee = await db.employee.findFirst({
			where: {
				id: input.employeeId,
				organizationId: input.organizationId,
				deletedAt: null,
				...getDealerScopeFilter(activeDealerId),
			},
			select: { id: true, name: true },
		});
		if (!employee) {
			throw new ORPCError("NOT_FOUND", { message: "Employee not found" });
		}

		const result = await db.$transaction(async (tx) => {
			const item = await tx.stockItem.findFirst({
				where: { id: input.id, organizationId: input.organizationId },
			});
			if (!item) {
				throw new ORPCError("NOT_FOUND", {
					message: "Stock item not found",
				});
			}

			const updated = await tx.stockItem.update({
				where: { id: item.id },
				data: { quantity: { decrement: input.quantity } },
			});
			if (updated.quantity < 0) {
				throw new ORPCError("CONFLICT", {
					message: `Only ${item.quantity} in stock — cannot deliver ${input.quantity}`,
				});
			}

			const existingAllocation = await tx.workerStock.findUnique({
				where: {
					stockItemId_employeeId: {
						stockItemId: item.id,
						employeeId: input.employeeId,
					},
				},
				select: { quantity: true },
			});
			const workerBefore = existingAllocation?.quantity ?? 0;

			await tx.workerStock.upsert({
				where: {
					stockItemId_employeeId: {
						stockItemId: item.id,
						employeeId: input.employeeId,
					},
				},
				create: {
					stockItemId: item.id,
					employeeId: input.employeeId,
					quantity: input.quantity,
					unitPrice: item.sellPrice,
				},
				update: {
					quantity: { increment: input.quantity },
					unitPrice: item.sellPrice,
				},
			});

			await tx.stockLog.create({
				data: {
					organizationId: input.organizationId,
					stockItemId: item.id,
					employeeId: input.employeeId,
					performedById: user.id,
					action: "TRANSFER_TO_WORKER",
					itemName: item.name,
					quantity: input.quantity,
					adminQtyBefore: updated.quantity + input.quantity,
					adminQtyAfter: updated.quantity,
					workerQtyBefore: workerBefore,
					workerQtyAfter: workerBefore + input.quantity,
					notes: input.notes ?? null,
				},
			});

			return { item: updated };
		});

		// Fire-and-forget notifications
		notifyFieldEmployee({
			organizationId: input.organizationId,
			employeeId: input.employeeId,
			title: "Stock delivered",
			message: `You received ${input.quantity} × ${result.item.name}`,
			type: "success",
		}).catch((err: unknown) =>
			logger.warn("[Stock Deliver] notify failed", {
				error: String(err),
			}),
		);

		if (
			result.item.alertEnabled &&
			result.item.alertThreshold !== null &&
			result.item.quantity <= result.item.alertThreshold
		) {
			const org = await db.organization.findFirst({
				where: { id: input.organizationId },
				select: { slug: true },
			});
			notifyOrgForReview({
				organizationId: input.organizationId,
				title: "Low stock alert",
				message: `${result.item.name} is down to ${result.item.quantity} (threshold ${result.item.alertThreshold})`,
				type: "warning",
				link: `/app/${org?.slug ?? ""}/stock`,
			}).catch((err: unknown) =>
				logger.warn("[Stock Deliver] low-stock notify failed", {
					error: String(err),
				}),
			);
		}

		return { item: result.item };
	});
