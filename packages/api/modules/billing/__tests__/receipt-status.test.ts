import { describe, expect, it } from "vitest";
import {
	classifyReceiptResend,
	getReceiptStatus,
	type ReceiptResendCandidate,
	receiptPhone,
	receiptStatusWhere,
} from "../lib/receipt-status";

const NOW = new Date("2026-09-17T12:00:00Z");

function candidate(
	overrides: Partial<ReceiptResendCandidate> = {},
): ReceiptResendCandidate {
	return {
		receiptSent: false,
		stoppedAccount: false,
		debtAccount: false,
		externalBillingId: null,
		paidAt: new Date("2026-09-04T09:00:00Z"),
		activityLog: [
			{
				action: "payment_created",
				status: "success",
				timestamp: "2026-09-04T09:00:00Z",
			},
			{
				action: "whatsapp_receipt",
				status: "failed",
				statusCode: 404,
				error: "API returned 404 after 3 attempts",
				timestamp: "2026-09-04T09:00:10Z",
			},
		],
		customer: {
			phones: [
				{ number: "70111111", primary: false },
				{ number: "71222222", primary: true },
			],
			mobile: "03333333",
			phone: null,
		},
		...overrides,
	};
}

describe("classifyReceiptResend", () => {
	it("queues a recent failed receipt on the primary structured phone", () => {
		expect(classifyReceiptResend(candidate(), NOW)).toEqual({
			action: "queue",
			phone: "71222222",
		});
	});

	it("queues a setup-approval payment that never had a send attempt", () => {
		const decision = classifyReceiptResend(
			candidate({ activityLog: [] }),
			NOW,
		);
		expect(decision.action).toBe("queue");
	});

	it.each([
		["not_found", null],
		["stopped", candidate({ stoppedAccount: true })],
		["debt", candidate({ debtAccount: true })],
		["already_sent", candidate({ receiptSent: true })],
		["legacy", candidate({ externalBillingId: 12345 })],
		["too_old", candidate({ paidAt: new Date("2026-07-10T00:00:00Z") })],
		[
			"no_phone",
			candidate({ customer: { phones: [], mobile: " ", phone: null } }),
		],
		[
			"rate_limited",
			candidate({
				activityLog: [
					{
						action: "whatsapp_receipt_manual",
						status: "failed",
						timestamp: "2026-09-17T11:59:30Z",
					},
				],
			}),
		],
	])("skips %s", (reason, payment) => {
		expect(classifyReceiptResend(payment, NOW)).toEqual({
			action: "skip",
			reason,
		});
	});

	it("checks stopped before the other reasons", () => {
		const decision = classifyReceiptResend(
			candidate({
				stoppedAccount: true,
				receiptSent: true,
				externalBillingId: 1,
			}),
			NOW,
		);
		expect(decision).toEqual({ action: "skip", reason: "stopped" });
	});
});

describe("receiptPhone", () => {
	it("falls back from phones[] to mobile, then phone", () => {
		expect(receiptPhone({ phones: [], mobile: "03", phone: "04" })).toBe(
			"03",
		);
		expect(receiptPhone({ phones: null, mobile: null, phone: "04" })).toBe(
			"04",
		);
		expect(
			receiptPhone({
				phones: [{ number: "70", primary: false }],
				mobile: "03",
				phone: null,
			}),
		).toBe("70");
	});
});

describe("getReceiptStatus (badge)", () => {
	const base = {
		receiptSent: false,
		stoppedAccount: false,
		debtAccount: false,
		activityLog: [] as unknown,
	};

	it("has no status for stopped and debt rows", () => {
		expect(getReceiptStatus({ ...base, stoppedAccount: true })).toBeNull();
		expect(getReceiptStatus({ ...base, debtAccount: true })).toBeNull();
	});

	it("is sent when the flag is set", () => {
		expect(getReceiptStatus({ ...base, receiptSent: true })).toBe("sent");
	});

	it("treats a worker skip (bad phone) as failed", () => {
		expect(
			getReceiptStatus({
				...base,
				activityLog: [
					{ action: "whatsapp_receipt", status: "skipped" },
				],
			}),
		).toBe("failed");
	});

	it("is pending when only non-receipt entries exist", () => {
		expect(
			getReceiptStatus({
				...base,
				activityLog: [{ action: "payment_created", status: "success" }],
			}),
		).toBe("pending");
	});
});

describe("receiptStatusWhere (filter)", () => {
	it("sent only checks the flag", () => {
		expect(receiptStatusWhere("sent")).toEqual({ receiptSent: true });
	});

	it("failed matches any failed/skipped send entry and excludes debt", () => {
		const where = receiptStatusWhere("failed");
		expect(where).toMatchObject({
			receiptSent: false,
			stoppedAccount: false,
			debtAccount: false,
		});
		const or = (where.AND?.[0] as { OR: unknown[] }).OR;
		expect(or).toHaveLength(4);
		expect(or).toContainEqual({
			activityLog: {
				array_contains: [
					{ action: "whatsapp_receipt_manual", status: "skipped" },
				],
			},
		});
	});

	it("pending is the negation of failed under the same flags", () => {
		const failed = receiptStatusWhere("failed");
		const pending = receiptStatusWhere("pending");
		expect(pending.AND).toEqual([{ NOT: failed.AND?.[0] }]);
		expect(pending.debtAccount).toBe(false);
	});
});
