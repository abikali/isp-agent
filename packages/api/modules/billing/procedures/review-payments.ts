import { ORPCError } from "@orpc/server";
import {
	getDealerScopeViaCustomer,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { notifyBadgeForOrganization } from "@repo/notifications";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { reviewOnePayment } from "../lib/review-payment-core";

/**
 * Bulk version of `reviewPayment` — the green ✓ ("Mark reviewed" /
 * "Approve & Deactivate") applied to a selection from the payments table.
 *
 * Each payment is processed sequentially through the shared `reviewOnePayment`
 * core (same as the single button): stopped accounts are deactivated in
 * iRadius first, then the local transaction runs. Sequential — not fanned out
 * — because the iRadius API stalls under parallel load and a fan-out would
 * exhaust the SSH connection budget for marginal speedup at the sizes (<=200)
 * the UI allows. Mirrors `bulkSetCustomerStatus`.
 *
 * Already-reviewed payments in the selection are skipped (no-op, counted as
 * `skipped`). A per-payment iRadius/DB failure is collected into `failures`
 * and processing continues, so one bad row never blocks the rest. Unlike the
 * single flow there is no per-row "iRadius user missing" prompt — the bulk
 * path tolerates missing users automatically (the customer is already gone in
 * iRadius, so the local deactivation is what's left to record).
 */
export const reviewPayments = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/payments/review-many",
		tags: ["Billing"],
		summary: "Mark a set of flagged payments as reviewed",
	})
	.input(
		z.object({
			organizationId: z.string(),
			paymentIds: z.array(z.string()).min(1).max(200),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId, iradiusDisabled } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);

		// Resolve only the payments the caller is allowed to touch. Anything
		// outside the dealer scope or wrong org is silently dropped.
		const payments = await db.payment.findMany({
			where: {
				id: { in: input.paymentIds },
				organizationId: input.organizationId,
				...getDealerScopeViaCustomer(activeDealerId),
			},
			select: {
				id: true,
				reviewedAt: true,
				stoppedAccount: true,
				customerId: true,
				invoiceId: true,
				customer: {
					select: { externalId: true, username: true },
				},
			},
		});

		if (payments.length === 0) {
			throw new ORPCError("NOT_FOUND", {
				message: "No accessible payments in this selection",
			});
		}

		let succeeded = 0;
		let skipped = 0;
		const failures: Array<{ id: string; reason: string }> = [];

		for (const payment of payments) {
			// Already reviewed — nothing to do.
			if (payment.reviewedAt) {
				skipped++;
				continue;
			}
			try {
				await reviewOnePayment({
					organizationId: input.organizationId,
					userId: user.id,
					payment,
					iradiusDisabled,
					// Bulk can't prompt per row — same convention as
					// bulkSetCustomerStatus deactivation.
					tolerateMissing: true,
				});
				succeeded++;
			} catch (error) {
				const reason =
					error instanceof Error ? error.message : "Unknown error";
				logger.error("[Payment bulk-review] Failed", {
					paymentId: payment.id,
					reason,
				});
				failures.push({ id: payment.id, reason });
			}
		}

		notifyBadgeForOrganization(input.organizationId);

		return {
			succeeded,
			skipped,
			failed: failures.length,
			failures,
			requested: input.paymentIds.length,
		};
	});
