import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, redis, ai } = vi.hoisted(() => ({
	db: {
		aiConversation: { findUnique: vi.fn(), update: vi.fn() },
		aiMessage: { findMany: vi.fn() },
		task: { findFirst: vi.fn() },
		aiConversationSummary: {
			findFirst: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
		},
	},
	redis: { exists: vi.fn() },
	ai: {
		escapeTelegramHtml: (t: string) => t,
		isSubstantiveEpisode: vi.fn(),
		resolveAgentCredentials: vi.fn(() => ({
			provider: "openrouter",
			apiKey: "k",
		})),
		resolveTeamTelegramTarget: vi.fn(),
		sendTelegramMessages: vi.fn(),
		summarizeConversationEpisode: vi.fn(),
	},
}));

vi.mock("@repo/ai", () => ai);
vi.mock("@repo/database", () => ({ db }));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../../connection", () => ({ getRedisConnection: () => redis }));

import {
	buildSummaryTelegramMessage,
	type EpisodeMessage,
	selectEpisodeRows,
	summarizeConversation,
} from "../conversation-summaries";

const NOW = new Date("2026-09-30T12:00:00Z");
const min = (m: number) => new Date(NOW.getTime() - m * 60_000);

function msg(role: string, minutesAgo: number): EpisodeMessage {
	return {
		role,
		content: `${role} ${minutesAgo}`,
		createdAt: min(minutesAgo),
	};
}

describe("selectEpisodeRows", () => {
	const rows = [
		msg("user", 600),
		msg("assistant", 599),
		// 5-hour pause
		msg("user", 300),
		msg("assistant", 299),
		msg("user", 290),
	];

	it("takes everything after the watermark", () => {
		expect(selectEpisodeRows(rows, min(299), 240)).toEqual(rows.slice(4));
	});

	it("starts after the last long pause the first time", () => {
		expect(selectEpisodeRows(rows, null, 240)).toEqual(rows.slice(2));
	});

	it("keeps everything when there is no long pause", () => {
		expect(selectEpisodeRows(rows, null, 600)).toEqual(rows);
	});
});

describe("buildSummaryTelegramMessage", () => {
	it("renders outcome, mood, actions, pending and the link", () => {
		const text = buildSummaryTelegramMessage({
			summary: {
				outcome: "escalated",
				customerMood: "upset",
				summary: "No internet since morning; line offline.",
				botActions: "Ran diagnose (offline)",
				openItems: "Team to call back",
			},
			customerName: "Joseph Helo",
			customerUsername: "joehelo",
			contactPhone: "96170123456",
			conversationUrl:
				"https://cp.example.com/app/libancom/conversations/c1",
			continuation: true,
		});
		expect(text).toContain("🔺 Escalated</b> — Joseph Helo (joehelo)");
		expect(text).toContain("follow-up to earlier conversation");
		expect(text).toContain("Mood: 😠 upset");
		expect(text).toContain("<b>Bot did:</b> Ran diagnose (offline)");
		expect(text).toContain("<b>Pending:</b> Team to call back");
		expect(text).toContain("/conversations/c1");
	});

	it("shows the phone for an unknown customer", () => {
		const text = buildSummaryTelegramMessage({
			summary: {
				outcome: "info_only",
				customerMood: "neutral",
				summary: "Asked for prices.",
				botActions: null,
				openItems: null,
			},
			customerName: null,
			customerUsername: null,
			contactPhone: "96170123456",
			conversationUrl: null,
			continuation: false,
		});
		expect(text).toContain("Unknown customer 96170123456");
		expect(text).not.toContain("Bot did");
	});
});

describe("summarizeConversation", () => {
	const conversation = {
		id: "conv-1",
		channelId: "ch-1",
		externalChatId: "chat-1",
		contactName: "Joseph",
		contactId: "96170123456",
		lastMessageAt: min(40),
		followUpDueAt: null as Date | null,
		summarizedThroughAt: null as Date | null,
		verifiedCustomerId: "cust-1",
		verifiedCustomer: {
			firstName: "Joseph",
			lastName: "Helo",
			username: "joehelo",
		},
		agent: {
			id: "agent-1",
			organizationId: "org-1",
			provider: "openrouter",
			encryptedApiKey: "enc",
			conversationSummaryMode: "each",
			contextGapThresholdMinutes: 240,
			organization: { slug: "libancom" },
		},
	};

	beforeEach(() => {
		vi.clearAllMocks();
		db.aiConversation.findUnique.mockResolvedValue({ ...conversation });
		db.aiConversation.update.mockResolvedValue({});
		redis.exists.mockResolvedValue(0);
		db.aiMessage.findMany.mockResolvedValue([
			msg("assistant", 42),
			msg("user", 43),
			msg("user", 45),
		]);
		db.task.findFirst.mockResolvedValue(null);
		db.aiConversationSummary.findFirst.mockResolvedValue(null);
		db.aiConversationSummary.create.mockResolvedValue({ id: "sum-1" });
		ai.isSubstantiveEpisode.mockReturnValue(true);
		ai.summarizeConversationEpisode.mockResolvedValue({
			model: "gpt-4.1-mini",
			summary: {
				outcome: "resolved",
				customerMood: "satisfied",
				summary: "Fixed.",
				botActions: null,
				openItems: null,
			},
		});
		ai.resolveTeamTelegramTarget.mockResolvedValue({
			botToken: "t",
			chatIds: ["1"],
		});
		ai.sendTelegramMessages.mockResolvedValue({ succeeded: 1, failed: [] });
	});

	it("waits while the chat lock is held", async () => {
		redis.exists.mockResolvedValue(1);
		expect(await summarizeConversation("conv-1", NOW)).toBe(false);
		expect(redis.exists).toHaveBeenCalledWith("ai:lock:ch-1:chat-1");
		expect(db.aiConversation.update).not.toHaveBeenCalled();
	});

	it("waits when a follow-up is due within 15 minutes", async () => {
		db.aiConversation.findUnique.mockResolvedValue({
			...conversation,
			followUpDueAt: new Date(NOW.getTime() + 10 * 60_000),
		});
		expect(await summarizeConversation("conv-1", NOW)).toBe(false);
		expect(ai.summarizeConversationEpisode).not.toHaveBeenCalled();
		expect(db.aiConversation.update).not.toHaveBeenCalled();
	});

	it("only reads messages after the watermark", async () => {
		db.aiConversation.findUnique.mockResolvedValue({
			...conversation,
			summarizedThroughAt: min(50),
		});
		await summarizeConversation("conv-1", NOW);
		expect(db.aiMessage.findMany.mock.calls[0]?.[0]?.where).toEqual({
			conversationId: "conv-1",
			deletedAt: null,
			createdAt: { gt: min(50) },
		});
	});

	it("advances the watermark without storing a trivial episode", async () => {
		ai.isSubstantiveEpisode.mockReturnValue(false);
		expect(await summarizeConversation("conv-1", NOW)).toBe(false);
		expect(db.aiConversationSummary.create).not.toHaveBeenCalled();
		expect(db.aiConversation.update).toHaveBeenCalledWith({
			where: { id: "conv-1" },
			data: { summarizedThroughAt: conversation.lastMessageAt },
		});
	});

	it("stores, sends and then moves the watermark", async () => {
		expect(await summarizeConversation("conv-1", NOW)).toBe(true);
		const data = db.aiConversationSummary.create.mock.calls[0]?.[0]?.data;
		expect(data).toMatchObject({
			conversationId: "conv-1",
			customerId: "cust-1",
			fromAt: min(45),
			toAt: min(42),
			userMessages: 2,
			botMessages: 1,
			outcome: "resolved",
		});
		expect(ai.sendTelegramMessages).toHaveBeenCalled();
		expect(db.aiConversationSummary.update).toHaveBeenCalledWith({
			where: { id: "sum-1" },
			data: { telegramSentAt: expect.any(Date) },
		});
		expect(db.aiConversation.update).toHaveBeenCalledWith({
			where: { id: "conv-1" },
			data: { summarizedThroughAt: conversation.lastMessageAt },
		});
	});

	it("stores but does not send an episode that was already escalated", async () => {
		db.task.findFirst.mockResolvedValue({
			id: "task-1",
			createdAt: min(44),
		});
		expect(await summarizeConversation("conv-1", NOW)).toBe(true);
		expect(
			db.aiConversationSummary.create.mock.calls[0]?.[0]?.data.taskId,
		).toBe("task-1");
		expect(ai.sendTelegramMessages).not.toHaveBeenCalled();
	});

	it("does not send Telegram in digest mode", async () => {
		db.aiConversation.findUnique.mockResolvedValue({
			...conversation,
			agent: { ...conversation.agent, conversationSummaryMode: "digest" },
		});
		await summarizeConversation("conv-1", NOW);
		expect(db.aiConversationSummary.create).toHaveBeenCalled();
		expect(ai.sendTelegramMessages).not.toHaveBeenCalled();
	});

	it("never stores the same episode twice", async () => {
		db.aiConversationSummary.findFirst.mockResolvedValueOnce({ id: "old" });
		expect(await summarizeConversation("conv-1", NOW)).toBe(false);
		expect(db.aiConversationSummary.create).not.toHaveBeenCalled();
	});

	it("retries later when the agent has no key", async () => {
		ai.resolveAgentCredentials.mockImplementationOnce(() => {
			throw new Error("no key");
		});
		expect(await summarizeConversation("conv-1", NOW)).toBe(false);
		expect(db.aiConversation.update).not.toHaveBeenCalled();
	});
});
