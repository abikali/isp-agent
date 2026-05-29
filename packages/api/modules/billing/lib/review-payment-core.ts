import { ORPCError } from "@orpc/server";
import { db } from "@repo/database";
import {
	IRadiusUserNotFoundError,
	iradiusSetActive,
} from "../../customers/lib/iradius-api";
import { mirrorToIRadius } from "../../customers/lib/iradius-mirror";
import { VOID_REASON, voidInvoice } from "./invoice-void";
import { closeReviewTasksForCustomer } from "./review-tasks";

/**
 * Minimal shape `reviewOnePayment` needs. Callers load it with their own
 * scope filters (org/dealer) and pass the row through.
 */
export interface ReviewablePayment {
	id: string;
	stoppedAccount: boolean;
	customerId: string;
	invoiceId: string | null;
	customer: { externalId: string | null; username: string | null };
}

/**
 * Mark one flagged payment reviewed — the single source of truth for what
 * the green ✓ ("Mark reviewed" / "Approve & Deactivate") does, shared by the
 * single-payment procedure (`review-payment.ts`) and the bulk procedure
 * (`review-payments.ts`) so the two can never drift.
 *
 * For a **stopped-account** payment this deactivates the customer in iRadius
 * FIRST (remote-first, per the mirroring rule); only if that succeeds does the
 * local transaction run — stamp `reviewedAt`, flip the customer to INACTIVE,
 * and void the invoice this stop replaces. The review task is then closed.
 *
 * For a normal flagged payment it only stamps `reviewedAt`.
 *
 * `tolerateMissing` forgives the "iRadius user already deleted" error and
 * still records the local deactivation. The single procedure sets it only
 * after the operator confirms via the client prompt (its `force` flag); the
 * bulk procedure sets it unconditionally since it can't prompt per row — the
 * same convention `bulkSetCustomerStatus` uses for deactivation.
 */
export async function reviewOnePayment(args: {
	organizationId: string;
	userId: string;
	payment: ReviewablePayment;
	iradiusDisabled?: boolean;
	tolerateMissing?: boolean;
}): Promise<void> {
	const {
		organizationId,
		userId,
		payment,
		iradiusDisabled,
		tolerateMissing,
	} = args;

	const runLocal = () =>
		db.$transaction(async (tx) => {
			await tx.payment.update({
				where: { id: payment.id },
				data: { reviewedAt: new Date() },
			});
			if (payment.stoppedAccount) {
				await tx.customer.update({
					where: { id: payment.customerId },
					data: { status: "INACTIVE" },
				});
				// Void the invoice this stop replaces — the customer is no
				// longer on the hook for this month. Keeps a full audit trail
				// (row stays; voidedAt + voidedById flag the write).
				if (payment.invoiceId) {
					await voidInvoice(
						tx,
						payment.invoiceId,
						userId,
						VOID_REASON.STOPPED,
					);
				}
			}
		});

	if (!payment.stoppedAccount) {
		await runLocal();
		return;
	}

	// Deactivate in iRadius FIRST when approving a stopped payment. If that
	// fails the local review + status change never run.
	await mirrorToIRadius({
		iradiusDisabled: iradiusDisabled ?? false,
		logTag: "iRadius deactivate on review-payment",
		failureMessage: "Failed to deactivate customer in iRadius",
		remote: async () => {
			try {
				await iradiusSetActive(payment.customer, false, {
					tolerateMissing: tolerateMissing === true,
				});
			} catch (error) {
				// Not tolerated: surface a distinct code so the single-payment
				// client can prompt the operator instead of showing a raw 500.
				if (error instanceof IRadiusUserNotFoundError) {
					throw new ORPCError("IRADIUS_USER_MISSING", {
						status: 409,
						message:
							"This customer no longer exists in iRadius — it may have been deleted there directly.",
					});
				}
				throw error;
			}
		},
		local: runLocal,
	});
	await closeReviewTasksForCustomer(organizationId, payment.customerId);
}
