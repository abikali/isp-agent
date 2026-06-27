import { ORPCError } from "@orpc/server";
import { notifyOrgForReview } from "@repo/api/lib/notify-employee";
import { getUserEmployeeId, requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const requestStockRefund = protectedProcedure
	.route({
		method: "POST",
		path: "/stock/items/{stockItemId}/request-refund",
		tags: ["Stock"],
		summary: "Request a refund (return) on stock the worker holds",
	})
	.input(
		z.object({
			organizationId: z.string(),
			stockItemId: z.string(),
			quantity: z.number().int().min(1),
			notes: z.string().max(500).optional(),
		}),
	)
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

		const allocation = await db.workerStock.findUnique({
			where: {
				stockItemId_employeeId: {
					stockItemId: input.stockItemId,
					employeeId,
				},
			},
			select: {
				quantity: true,
				unitPrice: true,
				stockItem: {
					select: { id: true, name: true, organizationId: true },
				},
			},
		});
		if (
			!allocation ||
			allocation.stockItem.organizationId !== input.organizationId
		) {
			throw new ORPCError("NOT_FOUND", {
				message: "You don't hold any of this item",
			});
		}

		// Cap the request to what the worker still holds minus any quantity
		// already awaiting review, so they can't over-request the same stock.
		const pendingAgg = await db.stockRefundRequest.aggregate({
			where: {
				employeeId,
				stockItemId: input.stockItemId,
				status: "PENDING",
			},
			_sum: { quantity: true },
		});
		const alreadyPending = pendingAgg._sum.quantity ?? 0;
		const refundable = allocation.quantity - alreadyPending;
		if (input.quantity > refundable) {
			throw new ORPCError("CONFLICT", {
				message:
					refundable <= 0
						? "You already have a pending refund for all of this stock"
						: `You can request a refund for at most ${refundable} (rest is already pending)`,
			});
		}

		const request = await db.stockRefundRequest.create({
			data: {
				organizationId: input.organizationId,
				stockItemId: input.stockItemId,
				employeeId,
				quantity: input.quantity,
				unitPrice: allocation.unitPrice,
				notes: input.notes ?? null,
			},
			include: {
				employee: { select: { id: true, name: true } },
				stockItem: { select: { id: true, name: true } },
			},
		});

		const org = await db.organization.findFirst({
			where: { id: input.organizationId },
			select: { slug: true },
		});
		notifyOrgForReview({
			organizationId: input.organizationId,
			title: "Stock refund to approve",
			message: `${request.employee.name} requested to return ${input.quantity} × ${request.stockItem.name}`,
			link: `/app/${org?.slug ?? ""}/stock`,
			excludeUserIds: [user.id],
		}).catch((err: unknown) =>
			logger.warn("[Stock Refund Request] notify failed", {
				error: String(err),
			}),
		);

		return { request };
	});
