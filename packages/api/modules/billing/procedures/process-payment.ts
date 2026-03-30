import { ORPCError } from "@orpc/server";
import {
	getDealerScopeViaCustomer,
	requirePermission,
} from "@repo/api/lib/permission";
import { db, PaymentStatus } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const processPayment = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/payments/process",
		tags: ["Billing"],
		summary: "Mark a payment as processed (admin)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			paymentId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);

		const payment = await db.payment.findFirst({
			where: {
				id: input.paymentId,
				organizationId: input.organizationId,
				...getDealerScopeViaCustomer(activeDealerId),
			},
		});

		if (!payment) {
			throw new ORPCError("NOT_FOUND", {
				message: "Payment not found",
			});
		}

		if (payment.status === PaymentStatus.PROCESSED) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Payment is already processed",
			});
		}

		const updated = await db.$transaction(async (tx) => {
			const result = await tx.payment.update({
				where: { id: input.paymentId },
				data: {
					status: PaymentStatus.PROCESSED,
					processedAt: new Date(),
					processedById: user.id,
				},
			});

			if (!payment.stoppedAccount) {
				await tx.customer.update({
					where: { id: payment.customerId },
					data: { paidCurrentCycle: true },
				});
			}

			return result;
		});

		return { payment: updated };
	});

export const bulkProcessPayments = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/payments/bulk-process",
		tags: ["Billing"],
		summary: "Bulk mark payments as processed",
	})
	.input(
		z.object({
			organizationId: z.string(),
			paymentIds: z.array(z.string()).min(1).max(200),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);

		const dealerViaCustomer = getDealerScopeViaCustomer(activeDealerId);

		const result = await db.$transaction(async (tx) => {
			// Find payments that will be processed (to get customerIds)
			const paymentsToProcess = await tx.payment.findMany({
				where: {
					id: { in: input.paymentIds },
					organizationId: input.organizationId,
					status: { not: PaymentStatus.PROCESSED },
					...dealerViaCustomer,
				},
				select: { id: true, customerId: true, stoppedAccount: true },
			});

			if (paymentsToProcess.length === 0) {
				return { count: 0 };
			}

			const updateResult = await tx.payment.updateMany({
				where: {
					id: { in: paymentsToProcess.map((p) => p.id) },
				},
				data: {
					status: PaymentStatus.PROCESSED,
					processedAt: new Date(),
					processedById: user.id,
				},
			});

			// Collect unique customerIds from non-stopped payments
			const customerIds = [
				...new Set(
					paymentsToProcess
						.filter((p) => !p.stoppedAccount)
						.map((p) => p.customerId),
				),
			];

			if (customerIds.length > 0) {
				await tx.customer.updateMany({
					where: { id: { in: customerIds } },
					data: { paidCurrentCycle: true },
				});
			}

			return updateResult;
		});

		return { updatedCount: result.count };
	});
