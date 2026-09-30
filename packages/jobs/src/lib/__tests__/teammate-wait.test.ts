import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockAi, execute, mockJobs } = vi.hoisted(() => {
	const execute = vi.fn().mockResolvedValue({ success: true });
	return {
		execute,
		mockDb: {
			aiConversation: { findUnique: vi.fn() },
			aiMessage: {
				findFirst: vi.fn(),
				findMany: vi.fn().mockResolvedValue([]),
			},
		},
		mockAi: {
			resolveAgentCredentials: vi
				.fn()
				.mockReturnValue({ provider: "openrouter", apiKey: "k" }),
			resolveAgentTools: vi.fn().mockResolvedValue({
				tools: { "escalate-telegram": { execute } },
				agentToolConfigs: [],
			}),
			teammateActionNeeded: vi.fn().mockResolvedValue(true),
		},
		mockJobs: {
			clearAwaitingHuman: vi.fn().mockResolvedValue(undefined),
			scheduleTeammateWait: vi.fn().mockResolvedValue(undefined),
			queueAiChatRetry: vi.fn().mockResolvedValue(undefined),
		},
	};
});

vi.mock("@repo/ai", () => mockAi);
vi.mock("@repo/database", () => ({ db: mockDb }));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../jobs/ai-chat.jobs", () => ({
	queueAiChatRetry: mockJobs.queueAiChatRetry,
}));
vi.mock("../../jobs/ai-teammate-wait.jobs", () => ({
	clearAwaitingHuman: mockJobs.clearAwaitingHuman,
	scheduleTeammateWait: mockJobs.scheduleTeammateWait,
	TEAMMATE_ALERT_AFTER_MS: 10 * 60_000,
	TEAMMATE_BOT_TAKEOVER_AFTER_MS: 30 * 60_000,
}));

import { handleTeammateWait, teammateReplyFireAt } from "../teammate-wait";

const SINCE = new Date(Date.now() - 11 * 60_000);

function conversation(overrides: Record<string, unknown> = {}) {
	return {
		id: "conv-1",
		channelId: "channel-1",
		status: "active",
		externalChatId: "96181338345@s.whatsapp.net",
		contactName: "raslan",
		contactId: "96181338345",
		awaitingHumanSince: SINCE,
		humanTakeoverAt: null,
		agent: {
			id: "agent-1",
			organizationId: "org-1",
			enabledTools: ["escalate-telegram"],
			encryptedApiKey: "enc",
			provider: "openrouter",
			humanTakeoverHours: 1,
		},
		...overrides,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	mockDb.aiConversation.findUnique.mockResolvedValue(conversation());
	mockDb.aiMessage.findFirst.mockResolvedValue(null);
	mockDb.aiMessage.findMany.mockResolvedValue([
		{ content: "??" },
		{ content: "leh ma radet 3a laye ?" },
	]);
	mockAi.teammateActionNeeded.mockResolvedValue(true);
});

describe("teammateReplyFireAt", () => {
	const since = new Date("2026-09-28T07:00:00Z");

	it("is 30 min after the customer started waiting", () => {
		expect(teammateReplyFireAt(since, null)).toEqual(
			new Date("2026-09-28T07:30:00Z"),
		);
	});

	it("waits for a takeover that ends later", () => {
		expect(
			teammateReplyFireAt(since, new Date("2026-09-28T07:55:00Z")),
		).toEqual(new Date("2026-09-28T07:55:00Z"));
	});

	it("ignores a takeover that ends sooner", () => {
		expect(
			teammateReplyFireAt(since, new Date("2026-09-28T07:10:00Z")),
		).toEqual(new Date("2026-09-28T07:30:00Z"));
	});
});

describe("handleTeammateWait — alert", () => {
	const job = {
		conversationId: "conv-1",
		channelId: "channel-1",
		stage: "alert" as const,
		origin: "deferral" as const,
	};

	it("skips when a teammate or the bot answered after the flag", async () => {
		// The first findFirst is the "answered" check.
		mockDb.aiMessage.findFirst.mockResolvedValueOnce({ id: "admin-row" });

		const result = await handleTeammateWait(job);

		expect(result).toEqual({ success: true, error: "Already answered" });
		expect(mockJobs.clearAwaitingHuman).toHaveBeenCalledWith("conv-1");
		expect(execute).not.toHaveBeenCalled();
		expect(mockJobs.scheduleTeammateWait).not.toHaveBeenCalled();
	});

	it("skips when nobody is waiting any more", async () => {
		mockDb.aiConversation.findUnique.mockResolvedValue(
			conversation({ awaitingHumanSince: null }),
		);

		await handleTeammateWait(job);

		expect(execute).not.toHaveBeenCalled();
	});

	it("escalates once and schedules the bot reply", async () => {
		const result = await handleTeammateWait(job);

		expect(result).toEqual({ success: true });
		expect(execute).toHaveBeenCalledTimes(1);
		const [args, options] = execute.mock.calls[0] ?? [];
		expect(args).toMatchObject({
			reason: "Customer waiting for a teammate reply",
			priority: "medium",
			category: "support",
			actionRequired:
				"Reply in the conversation, or press 'Let AI answer' in the dashboard.",
		});
		expect(args.summary).toContain("raslan wrote 2 message(s)");
		expect(args.summary).toContain("nobody has replied for 11 min");
		// Oldest first.
		expect(args.summary.indexOf("leh ma radet")).toBeLessThan(
			args.summary.indexOf("??"),
		);
		expect(options.toolCallId).toBe("awaiting-conv-1");
		expect(mockJobs.scheduleTeammateWait).toHaveBeenCalledWith({
			conversationId: "conv-1",
			channelId: "channel-1",
			stage: "reply",
			origin: "deferral",
			fireAt: new Date(SINCE.getTime() + 30 * 60_000),
		});
	});

	it("ends the wait without alerting when takeover-held messages need nobody", async () => {
		mockAi.teammateActionNeeded.mockResolvedValue(false);

		const result = await handleTeammateWait({ ...job, origin: "takeover" });

		expect(result).toEqual({ success: true, error: "Nothing to act on" });
		expect(mockJobs.clearAwaitingHuman).toHaveBeenCalledWith("conv-1");
		expect(execute).not.toHaveBeenCalled();
	});

	it("does not re-classify deferred messages (they were classified on arrival)", async () => {
		await handleTeammateWait(job);
		expect(mockAi.teammateActionNeeded).not.toHaveBeenCalled();
	});
});

describe("handleTeammateWait — reply", () => {
	it("queues a forced bot reply with the awaiting-teammate notice", async () => {
		const result = await handleTeammateWait({
			conversationId: "conv-1",
			channelId: "channel-1",
			stage: "reply",
			origin: "deferral",
		});

		expect(result).toEqual({ success: true });
		expect(mockJobs.queueAiChatRetry).toHaveBeenCalledWith({
			conversationId: "conv-1",
			channelId: "channel-1",
			bypassDeferral: true,
			contextNotice: "awaiting-teammate",
		});
		expect(execute).not.toHaveBeenCalled();
	});

	it("does nothing when someone answered in the meantime", async () => {
		mockDb.aiMessage.findFirst.mockResolvedValueOnce({ id: "bot-row" });

		await handleTeammateWait({
			conversationId: "conv-1",
			channelId: "channel-1",
			stage: "reply",
		});

		expect(mockJobs.queueAiChatRetry).not.toHaveBeenCalled();
	});
});
