import { ORPCError } from "@orpc/server";
import {
	getDealerScopeViaCustomer,
	requirePermission,
} from "@repo/api/lib/permission";
import { db, getPrimaryPhone } from "@repo/database";
import { queueWhatsAppReceipt } from "@repo/jobs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const resendReceipt = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/payments/resend-receipt",
		tags: ["Billing"],
		summary: "Manually resend a WhatsApp receipt for a payment",
	})
	.input(
		z.object({
			organizationId: z.string(),
			paymentId: z.string(),
			phone: z.string().optional(),
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
			select: {
				id: true,
				activityLog: true,
				stoppedAccount: true,
				customer: {
					select: { mobile: true, phone: true, phones: true },
				},
			},
		});

		if (!payment) {
			throw new ORPCError("NOT_FOUND", {
				message: "Payment not found",
			});
		}

		// Stopped customers must never receive the payment link — mirrors
		// the create-payment guard, which the UI alone can't enforce.
		if (payment.stoppedAccount) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Receipts are not sent for stopped accounts",
			});
		}

		// Rate limit: prevent resend within 60 seconds
		const log = Array.isArray(payment.activityLog)
			? (payment.activityLog as Array<Record<string, unknown>>)
			: [];
		const lastReceipt = [...log]
			.reverse()
			.find(
				(e) =>
					typeof e["action"] === "string" &&
					e["action"].startsWith("whatsapp_receipt"),
			);
		if (lastReceipt && typeof lastReceipt["timestamp"] === "string") {
			const elapsed =
				Date.now() - new Date(lastReceipt["timestamp"]).getTime();
			if (elapsed < 60_000) {
				throw new ORPCError("TOO_MANY_REQUESTS", {
					message:
						"Please wait at least 60 seconds before resending a receipt",
				});
			}
		}

		const phone =
			input.phone ??
			getPrimaryPhone(payment.customer.phones) ??
			payment.customer.mobile ??
			payment.customer.phone;

		if (!phone) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Customer has no phone number on file",
			});
		}

		await queueWhatsAppReceipt({
			phone,
			paymentId: payment.id,
			source: "manual",
		});

		return { success: true };
	});
