import { describe, expect, it } from "vitest";
import {
	isReferralRewardEligible,
	type ReferralRewardCandidate,
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
