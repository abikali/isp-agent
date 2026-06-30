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

// Approving a refund moves warehouse inventory, so review is gated on the
// admin-level `inventory:delete` capability — field workers only have
// read+update and must not review (let alone self-approve) refunds.
const REVIEW_ACTION = "delete" as const;

export const approveStockRefund = protectedProcedure
	.route({
		method: "POST",
		path: "/stock/refund-requests/{id}/approve",
		tags: ["Stock"],
		summary: "Approve a stock-refund request (returns stock to inventory)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"inventory",
			REVIEW_ACTION,
		);

		const request = await db.stockRefundRequest.findFirst({
			where: {
				id: input.id,
				organizationId: input.organizationId,
				employee: getDealerScopeFilter(activeDealerId),
			},
			select: {
				id: true,
				status: true,
				quantity: true,
				stockItemId: true,
				employeeId: true,
				stockItem: { select: { name: true } },
			},
		});
		if (!request) {
			throw new ORPCError("NOT_FOUND", {
				message: "Refund request not found",
			});
		}
		if (request.status !== "PENDING") {
			throw new ORPCError("CONFLICT", {
				message: "This request has already been reviewed",
			});
		}

		await db.$transaction(async (tx) => {
			const allocation = await tx.workerStock.findUnique({
				where: {
					stockItemId_employeeId: {
						stockItemId: request.stockItemId,
						employeeId: request.employeeId,
					},
				},
				select: { id: true, quantity: true },
			});
			if (!allocation || allocation.quantity < request.quantity) {
				throw new ORPCError("CONFLICT", {
					message: `Worker only holds ${allocation?.quantity ?? 0} — cannot refund ${request.quantity}`,
				});
			}

			await tx.workerStock.update({
				where: { id: allocation.id },
				data: { quantity: { decrement: request.quantity } },
			});

			const updatedItem = await tx.stockItem.update({
				where: { id: request.stockItemId },
				data: { quantity: { increment: request.quantity } },
			});

			await tx.stockLog.create({
				data: {
					organizationId: input.organizationId,
					stockItemId: request.stockItemId,
					employeeId: request.employeeId,
					performedById: user.id,
					action: "TRANSFER_FROM_WORKER",
					itemName: request.stockItem.name,
					quantity: request.quantity,
					adminQtyBefore: updatedItem.quantity - request.quantity,
					adminQtyAfter: updatedItem.quantity,
					workerQtyBefore: allocation.quantity,
					workerQtyAfter: allocation.quantity - request.quantity,
					notes: `Refund approved (request ${request.id})`,
				},
			});

			await tx.stockRefundRequest.update({
				where: { id: request.id },
				data: {
					status: "APPROVED",
					reviewedById: user.id,
					reviewedAt: new Date(),
				},
			});
		});

		notifyFieldEmployee({
			organizationId: input.organizationId,
			employeeId: request.employeeId,
			title: "Stock refund approved",
			message: `Your refund of ${request.quantity} × ${request.stockItem.name} was approved`,
			type: "success",
			telegramText: tgMessage({
				icon: "✅",
				title: "Stock refund approved",
				fields: [
					{
						icon: "🧰",
						value: `${request.quantity} × ${request.stockItem.name}`,
					},
				],
			}),
		}).catch((err: unknown) =>
			logger.warn("[Stock Refund Approve] notify failed", {
				error: String(err),
			}),
		);

		return { ok: true };
	});

export const rejectStockRefund = protectedProcedure
	.route({
		method: "POST",
		path: "/stock/refund-requests/{id}/reject",
		tags: ["Stock"],
		summary: "Reject a stock-refund request",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
			reason: z.string().max(500).optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"inventory",
			REVIEW_ACTION,
		);

		const request = await db.stockRefundRequest.findFirst({
			where: {
				id: input.id,
				organizationId: input.organizationId,
				employee: getDealerScopeFilter(activeDealerId),
			},
			select: {
				id: true,
				status: true,
				quantity: true,
				employeeId: true,
				stockItem: { select: { name: true } },
			},
		});
		if (!request) {
			throw new ORPCError("NOT_FOUND", {
				message: "Refund request not found",
			});
		}
		if (request.status !== "PENDING") {
			throw new ORPCError("CONFLICT", {
				message: "This request has already been reviewed",
			});
		}

		await db.stockRefundRequest.update({
			where: { id: request.id },
			data: {
				status: "REJECTED",
				reviewedById: user.id,
				reviewedAt: new Date(),
				rejectedReason: input.reason ?? null,
			},
		});

		notifyFieldEmployee({
			organizationId: input.organizationId,
			employeeId: request.employeeId,
			title: "Stock refund rejected",
			message: `Your refund of ${request.quantity} × ${request.stockItem.name} was rejected${input.reason ? `: ${input.reason}` : ""}`,
			type: "warning",
			telegramText: tgMessage({
				icon: "⛔",
				title: "Stock refund rejected",
				fields: [
					{
						icon: "🧰",
						value: `${request.quantity} × ${request.stockItem.name}`,
					},
					input.reason
						? { icon: "✍️", label: "Reason", value: input.reason }
						: null,
				],
			}),
		}).catch((err: unknown) =>
			logger.warn("[Stock Refund Reject] notify failed", {
				error: String(err),
			}),
		);

		return { ok: true };
	});
