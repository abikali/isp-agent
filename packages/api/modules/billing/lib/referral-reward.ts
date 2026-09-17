/**
 * Referral free month: when a collector records a free payment that names
 * the new customer the payer brought in (`referredCustomerId`), approving it
 * WhatsApps the payer — the referrer — that their free month was added.
 * Other free months (office accounts, natour, …) get no message.
 */
export interface ReferralRewardCandidate {
	freeAccount: boolean;
	stoppedAccount: boolean;
	referredCustomerId: string | null;
	reviewedAt: Date | null;
	referralRewardNotifiedAt: Date | null;
}

/**
 * Whether approving this payment should message the referrer. Only a first
 * approval of a referral free month that was never messaged qualifies — an
 * already-reviewed row being re-approved sends nothing.
 */
export function isReferralRewardEligible(
	payment: ReferralRewardCandidate,
): boolean {
	return (
		payment.freeAccount &&
		!payment.stoppedAccount &&
		payment.referredCustomerId !== null &&
		payment.reviewedAt === null &&
		payment.referralRewardNotifiedAt === null
	);
}

/** Activity-log action the worker writes for a referral reward send. */
export const REFERRAL_REWARD_ACTION = "whatsapp_referral_reward";
/** Same cool-down as a manual receipt resend. */
export const REFERRAL_REWARD_RESEND_COOLDOWN_MS = 60_000;

export interface ReferralRewardLogEntry {
	status?: unknown;
	error?: unknown;
	timestamp?: unknown;
}

/** Newest referral-reward send result in a payment's activity log. */
export function lastReferralRewardEntry(
	activityLog: unknown,
): ReferralRewardLogEntry | null {
	if (!Array.isArray(activityLog)) {
		return null;
	}
	for (let i = activityLog.length - 1; i >= 0; i--) {
		const entry = activityLog[i] as
			| (ReferralRewardLogEntry & { action?: unknown })
			| null;
		if (entry?.action === REFERRAL_REWARD_ACTION) {
			return entry;
		}
	}
	return null;
}

export type ReferralRewardResendBlock =
	| "not_referral"
	| "not_reviewed"
	| "rate_limited";

/**
 * Why the manual "Send free-month WhatsApp" can't run for this payment, or
 * `null` when it can. Unlike approval, a manual send may repeat a message
 * that already went out — the operator asked for it — but only for an
 * approved referral free month, and not twice within the cool-down.
 */
export function referralRewardResendBlock(
	payment: Omit<ReferralRewardCandidate, "referralRewardNotifiedAt"> & {
		activityLog: unknown;
	},
	now: Date,
): ReferralRewardResendBlock | null {
	if (
		!payment.freeAccount ||
		payment.stoppedAccount ||
		payment.referredCustomerId === null
	) {
		return "not_referral";
	}
	if (payment.reviewedAt === null) {
		return "not_reviewed";
	}
	const last = lastReferralRewardEntry(payment.activityLog);
	if (
		typeof last?.timestamp === "string" &&
		now.getTime() - new Date(last.timestamp).getTime() <
			REFERRAL_REWARD_RESEND_COOLDOWN_MS
	) {
		return "rate_limited";
	}
	return null;
}
