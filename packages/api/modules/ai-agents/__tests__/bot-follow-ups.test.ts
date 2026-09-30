import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, requirePermission, runBotFollowUpSweep } = vi.hoisted(() => ({
	db: {
		botFollowUp: {
			findMany: vi.fn(),
			findUnique: vi.fn(),
			updateMany: vi.fn(),
		},
		payment: { findMany: vi.fn() },
	},
	requirePermission: vi.fn(),
	runBotFollowUpSweep: vi.fn(),
}));

vi.mock("@repo/database", () => ({ db }));
vi.mock("@repo/jobs", () => ({ runBotFollowUpSweep }));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@repo/api/lib/permission", () => ({ requirePermission }));

import {
	approveBotFollowUps,
	buildBotFollowUpWhere,
	listBotFollowUps,
	sendBotFollowUpNow,
	skipBotFollowUps,
} from "../procedures/bot-follow-ups";

type Handler = (args: unknown) => Promise<Record<string, unknown>>;

function call(procedure: unknown, input: Record<string, unknown>) {
	const handler = (procedure as { "~orpc": { handler: Handler } })["~orpc"]
		.handler;
	return handler({
		context: { user: { id: "user-1" }, headers: new Headers() },
		input: { organizationId: "org-1", ...input },
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	requirePermission.mockResolvedValue({ activeDealerId: null });
	db.botFollowUp.findMany.mockResolvedValue([]);
	db.botFollowUp.updateMany.mockResolvedValue({ count: 2 });
	db.payment.findMany.mockResolvedValue([]);
});

describe("buildBotFollowUpWhere", () => {
	it("combines tab, type, outcome, customer and date filters", () => {
		const from = new Date("2026-09-01");
		expect(
			buildBotFollowUpWhere(
				{
					organizationId: "org-1",
					tab: "done",
					type: "post_stop",
					outcome: "moved",
					customerId: "cust-1",
					from,
				},
				null,
			),
		).toEqual({
			AND: [
				{ organizationId: "org-1" },
				{
					status: {
						in: [
							"resolved",
							"no_reply",
							"skipped",
							"failed",
							"cancelled",
						],
					},
				},
				{ type: "post_stop" },
				{ outcome: "moved" },
				{ customerId: "cust-1" },
				{ createdAt: { gte: from } },
			],
		});
	});

	it("scopes to the active dealer's customers", () => {
		const where = buildBotFollowUpWhere({ organizationId: "org-1" }, "d-1");
		expect(where.AND).toContainEqual({ customer: { dealerId: "d-1" } });
	});
});

describe("listBotFollowUps", () => {
	it("adds the collector's stop note next to the answer", async () => {
		db.botFollowUp.findMany.mockResolvedValue([
			{ id: "fu-1", paymentId: "pay-1" },
			{ id: "fu-2", paymentId: null },
		]);
		db.payment.findMany.mockResolvedValue([
			{ id: "pay-1", notes: "مسافر" },
		]);
		const result = await call(listBotFollowUps, {
			tab: "waiting",
			limit: 50,
		});
		expect(result["items"]).toEqual([
			{ id: "fu-1", paymentId: "pay-1", stopNote: "مسافر" },
			{ id: "fu-2", paymentId: null, stopNote: null },
		]);
		expect(requirePermission).toHaveBeenCalledWith(
			"org-1",
			"user-1",
			"aiAgents",
			"read",
		);
	});
});

describe("approve / skip / send now", () => {
	it("approve only moves rows awaiting approval", async () => {
		const result = await call(approveBotFollowUps, { ids: ["a", "b"] });
		expect(result).toEqual({ approved: 2 });
		const args = db.botFollowUp.updateMany.mock.calls[0]?.[0];
		expect(args.where).toEqual({
			id: { in: ["a", "b"] },
			organizationId: "org-1",
			status: "pending_approval",
		});
		expect(args.data).toMatchObject({
			status: "scheduled",
			approvedById: "user-1",
		});
		expect(requirePermission).toHaveBeenCalledWith(
			"org-1",
			"user-1",
			"aiAgents",
			"update",
		);
	});

	it("skip never touches rows already sent", async () => {
		await call(skipBotFollowUps, { ids: ["a"], reason: "wrong number" });
		const args = db.botFollowUp.updateMany.mock.calls[0]?.[0];
		expect(args.where.status).toEqual({
			in: ["pending_approval", "scheduled"],
		});
		expect(args.data).toEqual({
			status: "skipped",
			skipReason: "wrong number",
		});
	});

	it("send now makes the row due and runs the sweep", async () => {
		db.botFollowUp.updateMany.mockResolvedValue({ count: 1 });
		runBotFollowUpSweep.mockResolvedValue({
			dispatched: 1,
			noReply: 0,
			expired: 0,
		});
		db.botFollowUp.findUnique.mockResolvedValue({
			status: "sent",
			skipReason: null,
		});
		const result = await call(sendBotFollowUpNow, { id: "fu-1" });
		expect(result).toEqual({
			status: "sent",
			skipReason: null,
			swept: true,
		});
		expect(runBotFollowUpSweep).toHaveBeenCalled();
	});

	it("send now refuses a row that already went out", async () => {
		db.botFollowUp.updateMany.mockResolvedValue({ count: 0 });
		await expect(call(sendBotFollowUpNow, { id: "fu-1" })).rejects.toThrow(
			"already sent",
		);
		expect(runBotFollowUpSweep).not.toHaveBeenCalled();
	});
});
