import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findUnique: vi.fn(),
	update: vi.fn(),
	send: vi.fn(),
	queueRetry: vi.fn(),
}));

vi.mock("@repo/database", () => ({
	db: {
		ispDealer: { findUnique: mocks.findUnique },
		ispDealerAccount: { update: mocks.update },
	},
}));
vi.mock("@repo/jobs", () => ({
	sendWhatsAppDealerAccountUpdate: mocks.send,
	queueWhatsAppTemplateRetry: mocks.queueRetry,
}));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
	buildDealerNoticeParams,
	notifyDealerWhatsApp,
	resolveDealerWhatsAppPhone,
} from "../lib/notify-dealer";

const dealer = { name: "MATAR NET", companyName: null, username: "matar" };

describe("buildDealerNoticeParams", () => {
	const base = {
		dealer,
		kind: "payment" as const,
		amount: 1500,
		// 22:30 UTC on Sep 16 is already Sep 17 in Beirut (UTC+3).
		operationDate: new Date("2026-09-16T22:30:00Z"),
		owed: 250.5,
		prepaid: 40,
		note: null,
	};

	it("builds the seven params in template order", () => {
		expect(buildDealerNoticeParams(base)).toEqual([
			"MATAR NET",
			"دفعة",
			"$1,500.00",
			"2026-09-17",
			"$250.50",
			"$40.00",
			"-",
		]);
	});

	it("labels every ledger kind", () => {
		const label = (
			kind: Parameters<typeof buildDealerNoticeParams>[0]["kind"],
		) => buildDealerNoticeParams({ ...base, kind })[1];
		expect(label("bonus")).toBe("بونص");
		expect(label("write_off")).toBe("شطب دين");
		expect(label("in_kind")).toBe("تسوية عينية");
		expect(label("adjustment")).toBe("تسوية");
		expect(label("top_up")).toBe("إضافة رصيد");
		expect(label("deduction")).toBe("خصم رصيد");
	});

	it("says settled or in credit instead of a zero or negative amount", () => {
		expect(buildDealerNoticeParams({ ...base, owed: 0 })[4]).toBe(
			"لا شيء — حسابك مسدد",
		);
		expect(buildDealerNoticeParams({ ...base, owed: 0.001 })[4]).toBe(
			"لا شيء — حسابك مسدد",
		);
		expect(buildDealerNoticeParams({ ...base, owed: -20 })[4]).toBe(
			"لا شيء — لديك $20.00 لصالحك",
		);
	});

	it("collapses newlines and runs of spaces in the note and caps it", () => {
		const params = buildDealerNoticeParams({
			...base,
			note: "  2 routers\n\nftth    cable\t ",
		});
		expect(params[6]).toBe("2 routers ftth cable");
		expect(
			buildDealerNoticeParams({ ...base, note: "x".repeat(300) })[6],
		).toHaveLength(200);
	});

	it("falls back from iRadius's Unknown name to company, then username", () => {
		const unknown = { ...base, dealer: { ...dealer, name: "Unknown" } };
		expect(buildDealerNoticeParams(unknown)[0]).toBe("matar");
		expect(
			buildDealerNoticeParams({
				...unknown,
				dealer: { ...unknown.dealer, companyName: "Zaiter Net" },
			})[0],
		).toBe("Zaiter Net");
	});
});

describe("resolveDealerWhatsAppPhone", () => {
	it.each([
		["03123456", "9613123456"],
		["0096170123456", "96170123456"],
		["+961 71 123 456", "96171123456"],
		["70123456-71234567", "96170123456"],
		["70123456 - Hamza", "96170123456"],
	])("%s → %s", (raw, digits) => {
		expect(resolveDealerWhatsAppPhone([raw])).toEqual({
			status: "ok",
			phone: digits,
		});
	});

	it("reports an unparseable number as invalid, keeping the raw value", () => {
		expect(resolveDealerWhatsAppPhone(["791745774"])).toEqual({
			status: "invalid_phone",
			phone: "791745774",
		});
	});

	it("tries the next field when the first is junk", () => {
		expect(
			resolveDealerWhatsAppPhone(["sara tanous", null, "71123456"]),
		).toEqual({ status: "ok", phone: "96171123456" });
	});

	it("reports no phone when every field is empty", () => {
		expect(resolveDealerWhatsAppPhone([null, "", "  ", undefined])).toEqual(
			{ status: "no_phone", phone: null },
		);
	});
});

describe("notifyDealerWhatsApp", () => {
	const params = ["MATAR NET", "دفعة", "$10.00", "2026-09-17", "-", "-", "-"];
	const input = {
		dealerId: "dealer-1",
		dealerAccountId: "entry-1",
		params,
		send: true,
	};

	function savedNotice(): Record<string, unknown> {
		const call = mocks.update.mock.calls.at(-1)?.[0] as {
			where: { id: string };
			data: { whatsappNotice: Record<string, unknown> };
		};
		expect(call.where.id).toBe("entry-1");
		return call.data.whatsappNotice;
	}

	beforeEach(() => {
		vi.stubEnv("WPBOX_TOKEN", "token");
		mocks.findUnique.mockResolvedValue({
			phone: "71123456",
			companyMobile: null,
			companyPhone: null,
		});
		mocks.update.mockResolvedValue({});
		mocks.queueRetry.mockResolvedValue("job-1");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.clearAllMocks();
	});

	it("sends from the official number and stores the message id", async () => {
		mocks.send.mockResolvedValue({
			ok: true,
			phone: "96171123456",
			status: 200,
			messageId: "wamid-1",
		});

		const result = await notifyDealerWhatsApp(input);

		expect(result).toEqual({
			status: "sent",
			phone: "96171123456",
			error: null,
		});
		expect(mocks.send).toHaveBeenCalledWith({
			phone: "96171123456",
			params,
			dealerAccountId: "entry-1",
		});
		expect(savedNotice()).toMatchObject({
			status: "sent",
			messageId: "wamid-1",
			params,
		});
	});

	it("queues a retry on a transient failure", async () => {
		mocks.send.mockResolvedValue({
			ok: false,
			phone: "96171123456",
			status: 503,
			error: "API returned 503",
			retriable: true,
		});

		const result = await notifyDealerWhatsApp(input);

		expect(result.status).toBe("retrying");
		expect(mocks.queueRetry).toHaveBeenCalledWith({
			kind: "dealer_account_update",
			dealerAccountId: "entry-1",
			phone: "96171123456",
			params,
		});
		expect(savedNotice()).toMatchObject({ status: "retrying" });
	});

	it("records a permanent failure with the WPBox reason", async () => {
		mocks.send.mockResolvedValue({
			ok: false,
			phone: "96171123456",
			status: 200,
			error: "Invalid template",
			retriable: false,
		});

		const result = await notifyDealerWhatsApp(input);

		expect(result).toEqual({
			status: "failed",
			phone: "96171123456",
			error: "Invalid template",
		});
		expect(mocks.queueRetry).not.toHaveBeenCalled();
	});

	it("does not send when the dealer has no phone", async () => {
		mocks.findUnique.mockResolvedValue({
			phone: null,
			companyMobile: "",
			companyPhone: null,
		});

		const result = await notifyDealerWhatsApp(input);

		expect(result.status).toBe("no_phone");
		expect(mocks.send).not.toHaveBeenCalled();
		expect(savedNotice()).toMatchObject({ status: "no_phone", params });
	});

	it("reports not_configured without WPBOX_TOKEN", async () => {
		vi.stubEnv("WPBOX_TOKEN", "");

		const result = await notifyDealerWhatsApp(input);

		expect(result.status).toBe("not_configured");
		expect(mocks.send).not.toHaveBeenCalled();
	});

	it("records a skipped notice with its params so it can be sent later", async () => {
		const result = await notifyDealerWhatsApp({ ...input, send: false });

		expect(result).toEqual({ status: "skipped", phone: null, error: null });
		expect(mocks.findUnique).not.toHaveBeenCalled();
		expect(mocks.send).not.toHaveBeenCalled();
		expect(savedNotice()).toMatchObject({ status: "skipped", params });
	});

	it("never throws when storing the outcome fails", async () => {
		mocks.send.mockResolvedValue({
			ok: true,
			phone: "96171123456",
			status: 200,
			messageId: null,
		});
		mocks.update.mockRejectedValue(new Error("db down"));

		const result = await notifyDealerWhatsApp(input);

		expect(result).toEqual({
			status: "sent",
			phone: "96171123456",
			error: null,
		});
	});
});
