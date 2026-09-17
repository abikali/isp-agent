import {
	getDealerScopeViaCustomer,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { queueWhatsAppReceipt } from "@repo/jobs";
import { logger } from "@repo/logs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import {
	classifyReceiptResend,
	type ReceiptResendSkipReason,
} from "../lib/receipt-status";

/** Gap between queued sends so a bulk resend doesn't burst WPBox. */
const RESEND_STAGGER_MS = 1000;

/**
 * Bulk "Resend receipts" for a selection from the payments table (the
 * Receipt Failed / Receipt Pending filters). One receipt per payment row —
 * a lump collection that settled several months has a row, and a receipt,
 * per month, same as createPayment.
 *
 * `classifyReceiptResend` refuses stopped/debt rows, rows already sent,
 * legacy imports and anything older than the age window, so an over-broad
 * selection can't message the historical backlog. Sends are staggered and
 * deduplicated per payment inside `queueWhatsAppReceipt`.
 */
export const resendReceipts = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/payments/resend-receipts",
		tags: ["Billing"],
		summary: "Resend WhatsApp receipts for a set of payments",
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

		const paymentIds = [...new Set(input.paymentIds)];
		const payments = await db.payment.findMany({
			where: {
				id: { in: paymentIds },
				organizationId: input.organizationId,
				...getDealerScopeViaCustomer(activeDealerId),
			},
			select: {
				id: true,
				receiptSent: true,
				stoppedAccount: true,
				debtAccount: true,
				externalBillingId: true,
				paidAt: true,
				activityLog: true,
				customer: {
					select: { phones: true, mobile: true, phone: true },
				},
			},
		});
		const byId = new Map(payments.map((p) => [p.id, p]));

		const now = new Date();
		const skipped: Partial<Record<ReceiptResendSkipReason, number>> = {};
		let queued = 0;
		let failed = 0;

		for (const id of paymentIds) {
			const decision = classifyReceiptResend(byId.get(id), now);
			if (decision.action === "skip") {
				skipped[decision.reason] = (skipped[decision.reason] ?? 0) + 1;
				continue;
			}
			try {
				await queueWhatsAppReceipt(
					{ phone: decision.phone, paymentId: id, source: "manual" },
					{ delay: queued * RESEND_STAGGER_MS },
				);
				queued++;
			} catch (err) {
				failed++;
				logger.warn("[WhatsApp Receipt] Failed to queue bulk resend", {
					error: String(err),
					paymentId: id,
				});
			}
		}

		return { queued, failed, skipped };
	});
