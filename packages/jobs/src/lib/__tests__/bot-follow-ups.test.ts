import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, runPostEscalationCheck, sendOutreachTemplate, ai } = vi.hoisted(
	() => ({
		db: {
			botFollowUp: {
				findMany: vi.fn(),
				findFirst: vi.fn(),
				update: vi.fn(),
				updateMany: vi.fn(),
			},
			task: {
				findUnique: vi.fn(),
				update: vi.fn(),
				updateMany: vi.fn(),
			},
		},
		runPostEscalationCheck: vi.fn(),
		sendOutreachTemplate: vi.fn(),
		ai: {
			classifyCheckBackReply: vi.fn(),
			notifyTeamTelegram: vi.fn(),
			escapeTelegramHtml: (t: string) => t,
		},
	}),
);

vi.mock("@repo/database", () => ({ db }));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@repo/ai", () => ai);
vi.mock("../ai-follow-up", () => ({ runPostEscalationCheck }));
vi.mock("../outreach", () => ({ sendOutreachTemplate }));

import {
	captureFollowUpReply,
	runBotFollowUpSweep,
	settleCheckBackReplies,
} from "../bot-follow-ups";

const NOW = new Date("2026-09-30T10:00:00Z");
const HOUR = 60 * 60 * 1000;

function dueRow(id: string, type: string) {
	return {
		id,
		organizationId: "org-1",
		agentId: "agent-1",
		type,
		customerId: "cust-1",
		conversationId: "conv-1",
		taskId: "task-1",
		paymentId: null,
		phone: "96170123456",
		createdAt: NOW,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	db.botFollowUp.findMany.mockResolvedValue([]);
	db.botFollowUp.updateMany.mockResolvedValue({ count: 0 });
	db.botFollowUp.update.mockResolvedValue({});
	db.task.updateMany.mockResolvedValue({ count: 0 });
	db.task.update.mockResolvedValue({});
	runPostEscalationCheck.mockResolvedValue({ status: "sent" });
	sendOutreachTemplate.mockResolvedValue("sent");
});

describe("runBotFollowUpSweep", () => {
	it("dispatches each claimed row by type", async () => {
		db.botFollowUp.findMany
			.mockResolvedValueOnce([
				dueRow("a", "post_escalation"),
				dueRow("b", "post_stop"),
				dueRow("c", "post_install"),
			])
			.mockResolvedValueOnce([]);
		db.botFollowUp.updateMany.mockResolvedValue({ count: 1 });

		const result = await runBotFollowUpSweep(NOW);

		expect(result.dispatched).toBe(3);
		expect(runPostEscalationCheck).toHaveBeenCalledWith(
			expect.objectContaining({ id: "a" }),
		);
		expect(sendOutreachTemplate).toHaveBeenCalledTimes(2);
	});

	it("skips a row another sweep already claimed", async () => {
		db.botFollowUp.findMany
			.mockResolvedValueOnce([dueRow("a", "post_escalation")])
			.mockResolvedValueOnce([]);
		// The claim finds the row no longer `scheduled`.
		db.botFollowUp.updateMany.mockResolvedValueOnce({ count: 0 });

		const result = await runBotFollowUpSweep(NOW);

		expect(db.botFollowUp.updateMany.mock.calls[0]?.[0]).toEqual({
			where: { id: "a", status: "scheduled" },
			data: { status: "sending" },
		});
		expect(result.dispatched).toBe(0);
		expect(runPostEscalationCheck).not.toHaveBeenCalled();
	});

	it("marks a row failed when its sender throws", async () => {
		db.botFollowUp.findMany
			.mockResolvedValueOnce([dueRow("a", "post_install")])
			.mockResolvedValueOnce([]);
		db.botFollowUp.updateMany.mockResolvedValueOnce({ count: 1 });
		sendOutreachTemplate.mockRejectedValueOnce(new Error("boom"));

		await runBotFollowUpSweep(NOW);

		expect(db.botFollowUp.update).toHaveBeenCalledWith({
			where: { id: "a" },
			data: { status: "failed", skipReason: "boom" },
		});
	});

	it("turns answers older than 48h into no_reply and marks the task contacted", async () => {
		db.botFollowUp.findMany
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([
				{ id: "s1", type: "post_escalation", taskId: "task-9" },
				{ id: "s2", type: "silence", taskId: null },
			]);

		const result = await runBotFollowUpSweep(NOW);

		expect(result.noReply).toBe(2);
		const staleQuery = db.botFollowUp.findMany.mock.calls[1]?.[0];
		expect(staleQuery.where).toEqual({
			status: "sent",
			sentAt: { lt: new Date(NOW.getTime() - 48 * HOUR) },
		});
		expect(db.botFollowUp.updateMany).toHaveBeenCalledWith({
			where: { id: { in: ["s1", "s2"] }, status: "sent" },
			data: { status: "no_reply", outcome: "no_reply" },
		});
		expect(db.task.updateMany).toHaveBeenCalledWith({
			where: { id: { in: ["task-9"] }, followUpStatus: null },
			data: { followUpStatus: "contacted" },
		});
	});

	it("expires outreach nobody approved within 72h of its due time", async () => {
		await runBotFollowUpSweep(NOW);

		expect(db.botFollowUp.updateMany).toHaveBeenCalledWith({
			where: {
				status: "pending_approval",
				dueAt: { lt: new Date(NOW.getTime() - 72 * HOUR) },
			},
			data: { status: "skipped", skipReason: "approval_expired" },
		});
	});
});

describe("captureFollowUpReply", () => {
	it("flips a sent in-chat follow-up to replied", async () => {
		db.botFollowUp.findFirst.mockResolvedValue({
			id: "fu-1",
			type: "post_escalation",
			reply: null,
			replyAt: null,
		});

		const row = await captureFollowUpReply(
			"conv-1",
			"لا بعد ما حدا حكاني",
			NOW,
		);

		expect(row).toEqual({ id: "fu-1", type: "post_escalation" });
		expect(db.botFollowUp.findFirst.mock.calls[0]?.[0]?.where).toEqual({
			conversationId: "conv-1",
			channel: "bot",
			status: { in: ["sent", "replied"] },
			sentAt: { gte: new Date(NOW.getTime() - 72 * HOUR) },
		});
		expect(db.botFollowUp.update).toHaveBeenCalledWith({
			where: { id: "fu-1" },
			data: {
				status: "replied",
				replyAt: NOW,
				reply: "لا بعد ما حدا حكاني",
			},
		});
	});

	it("does nothing without a recent follow-up", async () => {
		db.botFollowUp.findFirst.mockResolvedValue(null);
		expect(await captureFollowUpReply("conv-1", "hi", NOW)).toBeNull();
		expect(db.botFollowUp.update).not.toHaveBeenCalled();
	});
});

describe("settleCheckBackReplies", () => {
	const credentials = { provider: "openrouter" as const, apiKey: "k" };
	const replied = {
		id: "fu-1",
		agentId: "agent-1",
		taskId: "task-1",
		messageText: "Did the team reach you?",
		reply: "yes all good now",
		organization: { slug: "libancom" },
		conversation: {
			contactName: "Joseph",
			contactId: "96170123456",
			verifiedCustomer: null,
		},
	};

	beforeEach(() => {
		db.botFollowUp.findMany.mockResolvedValue([replied]);
	});

	it("closes the task when the customer confirms it is solved", async () => {
		ai.classifyCheckBackReply.mockResolvedValue({
			resolved: "yes",
			reason: "Customer says it works",
		});
		db.task.findUnique.mockResolvedValue({
			id: "task-1",
			notes: null,
			status: "OPEN",
		});

		await settleCheckBackReplies({
			conversationId: "conv-1",
			credentials,
			botReply: "Great!",
			escalatedThisTurn: false,
			now: NOW,
		});

		expect(db.botFollowUp.update).toHaveBeenCalledWith({
			where: { id: "fu-1" },
			data: {
				status: "resolved",
				outcome: "resolved",
				reason: "Customer says it works",
			},
		});
		const taskUpdate = db.task.update.mock.calls[0]?.[0];
		expect(taskUpdate.data).toMatchObject({
			followUpStatus: "resolved",
			status: "COMPLETED",
			completedAt: NOW,
		});
		expect(taskUpdate.data.notes).toContain(
			"Check-back: customer confirmed solved — Customer says it works",
		);
		expect(ai.notifyTeamTelegram).not.toHaveBeenCalled();
	});

	it("reopens the task and alerts the team when it is still broken", async () => {
		ai.classifyCheckBackReply.mockResolvedValue({
			resolved: "no",
			reason: "Nobody called",
		});
		db.task.findUnique.mockResolvedValue({
			id: "task-1",
			notes: "old",
			status: "COMPLETED",
		});

		await settleCheckBackReplies({
			conversationId: "conv-1",
			credentials,
			botReply: null,
			escalatedThisTurn: false,
			now: NOW,
		});

		const taskUpdate = db.task.update.mock.calls[0]?.[0];
		expect(taskUpdate.data).toMatchObject({
			followUpStatus: "escalated",
			status: "OPEN",
			completedAt: null,
		});
		expect(taskUpdate.data).not.toHaveProperty("priority");
		expect(ai.notifyTeamTelegram).toHaveBeenCalledWith(
			"agent-1",
			expect.stringContaining("Still NOT solved after check-back"),
			{ conversationId: "conv-1" },
		);
	});

	it("leaves the alert to the escalation the bot just made", async () => {
		ai.classifyCheckBackReply.mockResolvedValue({
			resolved: "no",
			reason: "Still down",
		});
		db.task.findUnique.mockResolvedValue({
			id: "task-1",
			notes: null,
			status: "OPEN",
		});

		await settleCheckBackReplies({
			conversationId: "conv-1",
			credentials,
			botReply: "I escalated again",
			escalatedThisTurn: true,
			now: NOW,
		});

		expect(db.task.update).toHaveBeenCalled();
		expect(ai.notifyTeamTelegram).not.toHaveBeenCalled();
	});

	it("keeps an unclear answer open for the summary", async () => {
		ai.classifyCheckBackReply.mockResolvedValue({
			resolved: "unclear",
			reason: "Asked about a new plan",
		});

		await settleCheckBackReplies({
			conversationId: "conv-1",
			credentials,
			botReply: null,
			escalatedThisTurn: false,
			now: NOW,
		});

		expect(db.botFollowUp.update).toHaveBeenCalledWith({
			where: { id: "fu-1" },
			data: { reason: "Unclear: Asked about a new plan" },
		});
		expect(db.task.update).not.toHaveBeenCalled();
	});
});
