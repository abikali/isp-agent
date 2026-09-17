import { describe, expect, it } from "vitest";
import {
	isReferralRewardEligible,
	lastReferralRewardEntry,
	REFERRAL_REWARD_ACTION,
	type ReferralRewardCandidate,
	referralRewardResendBlock,
} from "../lib/referral-reward";

function candidate(
	overrides: Partial<ReferralRewardCandidate> = {},
): ReferralRewardCandidate {
	return {
		freeAccount: true,
		stoppedAccount: false,
		referredCustomerId: "cust_new",
		reviewedAt: null,
		referralRewardNotifiedAt: null,
		...overrides,
	};
}

describe("isReferralRewardEligible", () => {
	it("messages the first approval of a referral free month", () => {
		expect(isReferralRewardEligible(candidate())).toBe(true);
	});

	it("skips a free month with no referred customer (office, natour)", () => {
		expect(
			isReferralRewardEligible(candidate({ referredCustomerId: null })),
		).toBe(false);
	});

	it("skips cash payments even if a referred customer is set", () => {
		expect(
			isReferralRewardEligible(candidate({ freeAccount: false })),
		).toBe(false);
	});

	it("skips stopped accounts", () => {
		expect(
			isReferralRewardEligible(candidate({ stoppedAccount: true })),
		).toBe(false);
	});

	it("skips a payment that was already reviewed", () => {
		expect(
			isReferralRewardEligible(
				candidate({ reviewedAt: new Date("2026-09-10T08:00:00Z") }),
			),
		).toBe(false);
	});

	it("skips a payment already messaged", () => {
		expect(
			isReferralRewardEligible(
				candidate({
					referralRewardNotifiedAt: new Date("2026-09-10T08:00:00Z"),
				}),
			),
		).toBe(false);
	});
});

describe("referralRewardResendBlock", () => {
	const now = new Date("2026-09-17T12:00:00Z");
	const approved = {
		freeAccount: true,
		stoppedAccount: false,
		referredCustomerId: "cust_new",
		reviewedAt: new Date("2026-09-17T10:00:00Z"),
		activityLog: [] as unknown,
	};

	it("allows an approved referral free month", () => {
		expect(referralRewardResendBlock(approved, now)).toBeNull();
	});

	it("allows resending after an earlier success or failure", () => {
		expect(
			referralRewardResendBlock(
				{
					...approved,
					activityLog: [
						{
							action: REFERRAL_REWARD_ACTION,
							status: "failed",
							timestamp: "2026-09-17T11:00:00Z",
						},
					],
				},
				now,
			),
		).toBeNull();
	});

	it("refuses a non-referral payment", () => {
		expect(
			referralRewardResendBlock(
				{ ...approved, referredCustomerId: null },
				now,
			),
		).toBe("not_referral");
		expect(
			referralRewardResendBlock({ ...approved, freeAccount: false }, now),
		).toBe("not_referral");
		expect(
			referralRewardResendBlock(
				{ ...approved, stoppedAccount: true },
				now,
			),
		).toBe("not_referral");
	});

	it("refuses a payment that is not approved yet", () => {
		expect(
			referralRewardResendBlock({ ...approved, reviewedAt: null }, now),
		).toBe("not_reviewed");
	});

	it("rate-limits a send within the last minute", () => {
		expect(
			referralRewardResendBlock(
				{
					...approved,
					activityLog: [
						{
							action: REFERRAL_REWARD_ACTION,
							status: "success",
							timestamp: "2026-09-17T11:59:30Z",
						},
						{ action: "whatsapp_receipt", status: "success" },
					],
				},
				now,
			),
		).toBe("rate_limited");
	});
});

describe("lastReferralRewardEntry", () => {
	it("returns the newest referral entry, ignoring receipts", () => {
		expect(
			lastReferralRewardEntry([
				{ action: REFERRAL_REWARD_ACTION, status: "failed" },
				{ action: REFERRAL_REWARD_ACTION, status: "success" },
				{ action: "whatsapp_receipt", status: "failed" },
			])?.status,
		).toBe("success");
		expect(lastReferralRewardEntry(null)).toBeNull();
	});
});
