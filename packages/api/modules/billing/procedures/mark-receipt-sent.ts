import { ORPCError } from "@orpc/server";
import {
	getDealerScopeViaCustomer,
	requirePermission,
} from "@repo/api/lib/permission";
import { appendPaymentActivityLog, db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const markReceiptSent = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/payments/mark-receipt-sent",
		tags: ["Billing"],
		summary:
			"Manually mark a payment's WhatsApp receipt as sent (for stuck pending deliveries)",
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
			select: { id: true, receiptSent: true },
		});

		if (!payment) {
			throw new ORPCError("NOT_FOUND", {
				message: "Payment not found",
			});
		}

		if (payment.receiptSent) {
			return { success: true };
		}

		await appendPaymentActivityLog(
			[payment.id],
			{
				action: "whatsapp_receipt_marked_sent",
				status: "success",
				timestamp: new Date().toISOString(),
				detail: `Manually marked as sent by user ${user.id}`,
			},
			{ markReceiptSent: true },
		);

		return { success: true };
	});
