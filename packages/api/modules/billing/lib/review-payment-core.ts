import { ORPCError } from "@orpc/server";
import { type AuditContext, customerAudit } from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import { queueWhatsAppReferralReward } from "@repo/jobs";
import { logger } from "@repo/logs";
import {
	IRadiusUserNotFoundError,
	iradiusDeleteUser,
	iradiusSetActive,
} from "../../customers/lib/iradius-api";
import { mirrorToIRadius } from "../../customers/lib/iradius-mirror";
import { NOT_VOIDED } from "./filters";
import { VOID_REASON, voidInvoice } from "./invoice-void";
import {
	isReferralRewardEligible,
	type ReferralRewardCandidate,
} from "./referral-reward";
import { closeReviewTasksForCustomer } from "./review-tasks";
import {
	coverageKey,
	fetchCoverageMap,
	invoiceAmount,
	monthRemaining,
} from "./settlement";

/**
 * Minimal shape `reviewOnePayment` needs. Callers load it with their own
 * scope filters (org/dealer) and pass the row through.
 */
export interface ReviewablePayment extends ReferralRewardCandidate {
	id: string;
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
 * For a normal flagged payment it stamps `reviewedAt`; when that payment is a
 * referral free month it also queues the referrer's "free month" WhatsApp
 * (see `claimReferralReward`).
 *
 * `tolerateMissing` forgives the "iRadius user already deleted" error and
 * still records the local deactivation. The single procedure sets it only
 * after the operator confirms via the client prompt (its `force` flag); the
 * bulk procedure sets it unconditionally since it can't prompt per row — the
 * same convention `bulkSetCustomerStatus` uses for deactivation.
 *
 * `stopAction: "delete"` ("Inactive + delete from iRadius and CP") goes
 * further for a stopped account: after the deactivation it deletes the
 * subscriber natively in iRadius (irreversible, so it is the LAST remote
 * step and only runs once the local pre-checks passed), and the local
 * transaction also soft-deletes the customer (`deletedAt`; payments and
 * invoices stay). A missing iRadius user just means it is already gone.
 * Refused while the customer owes other months unless `ignoreOwedMonths`.
 */
export async function reviewOnePayment(args: {
	organizationId: string;
	userId: string;
	payment: ReviewablePayment;
	iradiusDisabled?: boolean;
	tolerateMissing?: boolean;
	stopAction?: "inactive" | "delete";
	/** Recorded in iRadius' "Delete User By …" history line. */
	operatorName?: string;
	ignoreOwedMonths?: boolean;
	auditContext?: AuditContext;
}): Promise<{ referralRewardQueued: boolean }> {
	const {
		organizationId,
		userId,
		payment,
		iradiusDisabled,
		tolerateMissing,
	} = args;
	const deleteCustomer =
		payment.stoppedAccount && args.stopAction === "delete";

	if (deleteCustomer && !args.ignoreOwedMonths) {
		const owed = await countOwedMonths(
			organizationId,
			payment.customerId,
			payment.invoiceId,
		);
		if (owed > 0) {
			throw new ORPCError("CONFLICT", {
				message: `Customer still owes ${owed} month(s) — collect or void them first, or choose Inactive only`,
				data: { owedMonths: owed },
			});
		}
	}

	const runLocal = () =>
		db.$transaction(async (tx) => {
			await tx.payment.update({
				where: { id: payment.id },
				data: { reviewedAt: new Date() },
			});
			if (payment.stoppedAccount) {
				await tx.customer.update({
					where: { id: payment.customerId },
					data: {
						status: "INACTIVE",
						// Soft delete: hidden from CP lists, history kept, and
						// the sync skips it (no "deleted on iRadius" conflict).
						...(deleteCustomer ? { deletedAt: new Date() } : {}),
					},
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
		return { referralRewardQueued: await claimReferralReward(payment) };
	}

	// Deactivate in iRadius FIRST when approving a stopped payment. If that
	// fails the local review + status change never run.
	await mirrorToIRadius({
		iradiusDisabled: iradiusDisabled ?? false,
		logTag: "iRadius deactivate on review-payment",
		failureMessage: deleteCustomer
			? "Failed to deactivate / delete the customer in iRadius"
			: "Failed to deactivate customer in iRadius",
		remote: async () => {
			try {
				await iradiusSetActive(payment.customer, false, {
					// Deleting anyway: an already-missing user is the goal.
					tolerateMissing: tolerateMissing === true || deleteCustomer,
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
			if (deleteCustomer && payment.customer.externalId) {
				try {
					await iradiusDeleteUser(
						payment.customer,
						args.operatorName ?? "CP",
					);
				} catch (error) {
					// Surface iRadius' own reason (e.g. the bridge is missing)
					// instead of the generic failure message.
					throw new ORPCError("BAD_GATEWAY", {
						message: `iRadius delete failed: ${error instanceof Error ? error.message : String(error)}`,
					});
				}
			}
		},
		local: runLocal,
	});
	await closeReviewTasksForCustomer(organizationId, payment.customerId);
	if (deleteCustomer) {
		// The uninstall task (if any) is kept on purpose: the equipment still
		// has to be recovered.
		customerAudit.deleted(
			payment.customerId,
			userId,
			organizationId,
			args.auditContext ?? {},
		);
	}
	return { referralRewardQueued: false };
}

/**
 * How many billed months the customer still owes, ignoring the invoice the
 * stop replaces (the approval voids it). Voided invoices never count;
 * settlement is the same amount comparison the collector lists use.
 */
async function countOwedMonths(
	organizationId: string,
	customerId: string,
	stopInvoiceId: string | null,
): Promise<number> {
	const invoices = await db.customerInvoice.findMany({
		where: {
			organizationId,
			customerId,
			...NOT_VOIDED,
			...(stopInvoiceId ? { id: { not: stopInvoiceId } } : {}),
		},
		select: { year: true, month: true, total: true, totalWithTax: true },
	});
	if (invoices.length === 0) {
		return 0;
	}
	const months = await db.billingMonth.findMany({
		where: {
			organizationId,
			OR: invoices.map((inv) => ({ year: inv.year, month: inv.month })),
		},
		select: { id: true, year: true, month: true },
	});
	const monthId = new Map(months.map((m) => [`${m.year}-${m.month}`, m.id]));
	const coverage = await fetchCoverageMap(
		db,
		organizationId,
		months.map((m) => m.id),
		[customerId],
	);
	return invoices.filter((inv) => {
		const id = monthId.get(`${inv.year}-${inv.month}`);
		const cov = id ? coverage.get(coverageKey(customerId, id)) : undefined;
		return monthRemaining(invoiceAmount(inv), cov) > 0;
	}).length;
}

/**
 * Referral free-month WhatsApps stay off until the `referral_free_month`
 * template is approved in Salti — a send to an unapproved template fails and
 * would still use up the payment's one automatic message. Set
 * `WHATSAPP_REFERRAL_REWARD_ENABLED=true` once it is approved.
 */
export function isReferralRewardMessagingEnabled(): boolean {
	return process.env["WHATSAPP_REFERRAL_REWARD_ENABLED"] === "true";
}

/**
 * Queue the referrer's "free month" WhatsApp for a just-approved payment.
 * Never throws — a messaging problem must not fail the approval. Does
 * nothing while messaging is switched off; a payment approved then can be
 * messaged later from the row's "Send free-month WhatsApp" action.
 *
 * `payment` is the state loaded before the review, so a row that was already
 * reviewed never messages. The claim on `referralRewardNotifiedAt` is atomic
 * (a double-clicked approve queues once), and a referrer whose reward for
 * the same new customer was already messaged — a re-recorded payment — is not
 * messaged again.
 */
async function claimReferralReward(
	payment: ReviewablePayment,
): Promise<boolean> {
	if (
		!isReferralRewardMessagingEnabled() ||
		!isReferralRewardEligible(payment)
	) {
		return false;
	}
	try {
		const alreadyMessaged = await db.payment.findFirst({
			where: {
				id: { not: payment.id },
				customerId: payment.customerId,
				referredCustomerId: payment.referredCustomerId,
				referralRewardNotifiedAt: { not: null },
			},
			select: { id: true },
		});
		if (alreadyMessaged) {
			return false;
		}
		const { count } = await db.payment.updateMany({
			where: { id: payment.id, referralRewardNotifiedAt: null },
			data: { referralRewardNotifiedAt: new Date() },
		});
		if (count === 0) {
			return false;
		}
		try {
			await queueWhatsAppReferralReward(payment.id);
		} catch (error) {
			// Release the claim so the message isn't marked as handled.
			await db.payment.update({
				where: { id: payment.id },
				data: { referralRewardNotifiedAt: null },
			});
			throw error;
		}
		return true;
	} catch (error) {
		logger.warn("[Referral Reward] Failed to queue WhatsApp", {
			paymentId: payment.id,
			error: String(error),
		});
		return false;
	}
}
