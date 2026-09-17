import { beforeEach, describe, expect, it, vi } from "vitest";

const redis = { set: vi.fn(), del: vi.fn() };

vi.mock("@repo/database", () => ({
	db: {
		employee: { findMany: vi.fn() },
		cashCollection: { create: vi.fn() },
		$transaction: vi.fn(),
	},
}));

vi.mock("@repo/jobs", () => ({
	getRedisConnection: vi.fn(() => redis),
}));

vi.mock("@repo/logs", () => ({
	logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

vi.mock("@repo/api/lib/permission", () => ({
	requirePermission: vi.fn(),
	getDealerScopeFilter: vi.fn(() => ({})),
}));

vi.mock("@repo/api/lib/notify-employee", () => ({
	notifyFieldEmployee: vi.fn(() => Promise.resolve()),
}));

vi.mock("@repo/auth/lib/audit", () => ({
	cashAudit: { transferred: vi.fn() },
	getAuditContextFromHeaders: vi.fn(() => ({})),
}));

vi.mock("../lib/cash-cache", () => ({
	bustCashStats: vi.fn(),
}));

import { notifyFieldEmployee } from "@repo/api/lib/notify-employee";
import { requirePermission } from "@repo/api/lib/permission";
import { cashAudit } from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import { transferCash } from "../procedures/transfer-cash";

const mockDb = vi.mocked(db);
const mockNotify = vi.mocked(notifyFieldEmployee);

const user = { id: "user-1" };
const orgId = "org-1";

const COLLECTOR = {
	id: "emp-coll",
	name: "Ibrahim Alewe",
	username: "collalewe",
	telegramChatId: "111",
};
const CASHIER = {
	id: "emp-cash",
	name: "Ibrahim Alewe",
	username: "walewe",
	telegramChatId: "111",
};

const INPUT = {
	organizationId: orgId,
	fromEmployeeId: COLLECTOR.id,
	toEmployeeId: CASHIER.id,
	amount: 2222.67,
};

interface Procedure {
	"~orpc": {
		handler: (args: unknown) => Promise<unknown>;
		inputSchema: { parse: (v: unknown) => typeof INPUT };
	};
}
const procedure = transferCash as unknown as Procedure;

function call(input: unknown) {
	return procedure["~orpc"].handler({
		context: { user, headers: new Headers() },
		input,
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(requirePermission).mockResolvedValue({
		member: {} as never,
		permCtx: {} as never,
		activeDealerId: null,
		iradiusDisabled: false,
	});
	redis.set.mockResolvedValue("OK");
	redis.del.mockResolvedValue(1);
	mockDb.employee.findMany.mockResolvedValue([COLLECTOR, CASHIER] as never);
	mockDb.cashCollection.create.mockImplementation(
		((args: unknown) => args) as never,
	);
	mockDb.$transaction.mockResolvedValue([] as never);
});

describe("billing.collections.transfer input", () => {
	it("rounds a float balance to cents", () => {
		const parsed = procedure["~orpc"].inputSchema.parse({
			...INPUT,
			amount: 2222.6699999999996,
		});
		expect(parsed.amount).toBe(2222.67);
	});

	it("refuses amounts that round to less than a cent", () => {
		expect(() =>
			procedure["~orpc"].inputSchema.parse({ ...INPUT, amount: 0.001 }),
		).toThrow();
		expect(() =>
			procedure["~orpc"].inputSchema.parse({ ...INPUT, amount: -5 }),
		).toThrow();
	});
});

describe("billing.collections.transfer", () => {
	it("writes one pair of ADMIN_TRANSFER legs that nets to zero", async () => {
		await call(INPUT);

		expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
		const legs = mockDb.cashCollection.create.mock.calls.map(
			(c) => (c[0] as { data: Record<string, unknown> }).data,
		);
		expect(legs).toHaveLength(2);
		const [out, inbound] = legs;
		expect(out).toMatchObject({
			collectorId: COLLECTOR.id,
			amount: 2222.67,
			type: "ADMIN_TRANSFER",
			receivedById: user.id,
		});
		expect(inbound).toMatchObject({
			collectorId: CASHIER.id,
			amount: -2222.67,
			type: "ADMIN_TRANSFER",
		});
		expect(out?.["transferId"]).toBeTruthy();
		expect(out?.["transferId"]).toBe(inbound?.["transferId"]);
		expect(out?.["collectedAt"]).toBe(inbound?.["collectedAt"]);
		expect(
			(out?.["amount"] as number) + (inbound?.["amount"] as number),
		).toBe(0);
		expect(vi.mocked(cashAudit.transferred)).toHaveBeenCalledTimes(1);
	});

	it("refuses moving cash to the same person", async () => {
		await expect(
			call({ ...INPUT, toEmployeeId: COLLECTOR.id }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mockDb.$transaction).not.toHaveBeenCalled();
	});

	it("refuses when either person is out of scope or inactive", async () => {
		mockDb.employee.findMany.mockResolvedValue([COLLECTOR] as never);

		await expect(call(INPUT)).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(mockDb.$transaction).not.toHaveBeenCalled();
	});

	it("refuses an identical move already in flight", async () => {
		redis.set.mockResolvedValue(null);

		await expect(call(INPUT)).rejects.toMatchObject({ code: "CONFLICT" });
		expect(mockDb.$transaction).not.toHaveBeenCalled();
	});

	it("releases the lock when the write fails so a retry can go through", async () => {
		mockDb.$transaction.mockRejectedValue(new Error("db down"));

		await expect(call(INPUT)).rejects.toThrow("db down");
		expect(redis.del).toHaveBeenCalledTimes(1);
	});

	it("sends one Telegram message when both records share a chat", async () => {
		await call(INPUT);

		const calls = mockNotify.mock.calls.map((c) => c[0]);
		expect(calls).toHaveLength(2);
		expect(calls.filter((c) => !c.skipTelegram)).toHaveLength(1);
	});
});
