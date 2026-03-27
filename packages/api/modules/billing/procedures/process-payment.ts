import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { db } from "@repo/database";
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
		const member = await verifyOrganizationMembership(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "You must be a member of this organization",
			});
		}

		const payment = await db.payment.findFirst({
			where: {
				id: input.paymentId,
				organizationId: input.organizationId,
			},
		});

		if (!payment) {
			throw new ORPCError("NOT_FOUND", {
				message: "Payment not found",
			});
		}

		if (payment.status === "PROCESSED") {
			throw new ORPCError("BAD_REQUEST", {
				message: "Payment is already processed",
			});
		}

		const updated = await db.payment.update({
			where: { id: input.paymentId },
			data: {
				status: "PROCESSED",
				processedAt: new Date(),
				processedById: user.id,
			},
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
		const member = await verifyOrganizationMembership(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "You must be a member of this organization",
			});
		}

		const result = await db.payment.updateMany({
			where: {
				id: { in: input.paymentIds },
				organizationId: input.organizationId,
				status: { not: "PROCESSED" },
			},
			data: {
				status: "PROCESSED",
				processedAt: new Date(),
				processedById: user.id,
			},
		});

		return { updatedCount: result.count };
	});
