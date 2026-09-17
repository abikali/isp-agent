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
