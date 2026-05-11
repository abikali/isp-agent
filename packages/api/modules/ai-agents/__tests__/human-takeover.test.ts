import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────

const { mockRedis, mockDb, mockSendTextMessage, mockGenerateAgentResponse } =
	vi.hoisted(() => {
		let multiCallCount = 0;
		const mockRedis = {
			set: vi.fn(),
			get: vi.fn(),
			del: vi.fn(),
			rpush: vi.fn(),
			expire: vi.fn(),
			eval: vi.fn(),
			lrange: vi.fn(),
			multi: vi.fn(() => {
				multiCallCount++;
				return {
					lrange: vi.fn(),
					del: vi.fn(),
					exec: vi.fn().mockResolvedValue(
						multiCallCount === 1
							? [
									[null, ["Hello"]],
									[null, 1],
								]
							: [
									[null, []],
									[null, 0],
								],
					),
				};
			}),
			resetMultiCount: () => {
				multiCallCount = 0;
			},
		};

		const mockDb = {
			aiAgentChannel: {
				findUnique: vi.fn(),
				update: vi.fn().mockResolvedValue({}),
			},
			aiConversation: {
				findFirst: vi.fn(),
				findUnique: vi.fn(),
				create: vi.fn(),
				update: vi.fn().mockResolvedValue({}),
				updateMany: vi.fn().mockResolvedValue({ count: 1 }),
			},
			aiMessage: {
				findFirst: vi.fn(),
				findMany: vi.fn(),
				create: vi.fn().mockResolvedValue({}),
				updateMany: vi.fn().mockResolvedValue({ count: 0 }),
			},
			aiAgentToolConfig: {
				findMany: vi.fn().mockResolvedValue([]),
			},
			aiMessageReaction: {
				findUnique: vi.fn(),
				create: vi.fn(),
				update: vi.fn(),
				deleteMany: vi.fn(),
			},
			customer: {
				findMany: vi.fn().mockResolvedValue([]),
			},
		};

		const mockSendTextMessage = vi
			.fn()
			.mockResolvedValue({ messageId: "msg-1" });

		const mockGenerateAgentResponse = vi.fn().mockResolvedValue({
			text: "AI response",
			tokenCount: 100,
			latencyMs: 500,
			toolResults: null,
		});

		return {
			mockRedis,
			mockDb,
			mockSendTextMessage,
			mockGenerateAgentResponse,
		};
	});

// ── Module mocks ─────────────────────────────────────────────────────

vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("@repo/jobs", () => ({
	getRedisConnection: vi.fn(() => mockRedis),
	queueAiChatRetry: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@repo/database", () => ({
	db: mockDb,
}));

vi.mock("@repo/quotas", () => ({
	checkAndIncrementQuota: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock("@repo/storage", () => ({
	uploadBuffer: vi.fn().mockResolvedValue(undefined),
}));

// Import real implementations via vi.hoisted so they're available in mock factories
const { computeBotFingerprint, isHumanTakeoverActive } = vi.hoisted(() => {
	// Inline the real implementations — can't import in hoisted context
	const { createHash } = require("node:crypto");

	function computeBotFingerprint(text: string): string {
		return createHash("sha256")
			.update(text.slice(0, 200))
			.digest("hex")
			.slice(0, 16);
	}

	function isHumanTakeoverActive(
		humanTakeoverAt: Date | null,
		humanTakeoverHours: number | null,
	): boolean {
		if (!humanTakeoverAt || !humanTakeoverHours) {
			return false;
		}
		const expiresAt = new Date(
			humanTakeoverAt.getTime() + humanTakeoverHours * 60 * 60 * 1000,
		);
		return new Date() < expiresAt;
	}

	return { computeBotFingerprint, isHumanTakeoverActive };
});

vi.mock("@repo/ai", () => ({
	parseWebhookPayload: vi.fn(),
	sendTextMessage: mockSendTextMessage,
	sendTypingIndicator: vi.fn().mockResolvedValue(undefined),
	markAsRead: vi.fn().mockResolvedValue(undefined),
	decryptToken: vi.fn().mockReturnValue("decrypted-token"),
	buildSystemPrompt: vi.fn().mockReturnValue("system prompt"),
	buildContextGapNote: vi.fn().mockReturnValue(null),
	generateAgentResponse: mockGenerateAgentResponse,
	resolveTools: vi.fn().mockReturnValue({}),
	formatHistoryMessage: vi.fn((m: unknown) => m),
	processMedia: vi.fn().mockResolvedValue(null),
	transcribeMessageMedia: vi.fn().mockResolvedValue(null),
	triageBufferedMessages: vi.fn(),
	executeEscalationGuard: vi.fn().mockResolvedValue(null),
	extractToolPromptOverrides: vi.fn().mockReturnValue({}),
	isWhishMoneyMessage: vi.fn().mockReturnValue(false),
	WHISH_MONEY_CONTEXT: "",
	computeBotFingerprint,
	isHumanTakeoverActive,
	whatsapp: {
		parseReceiptUpdate: vi.fn().mockReturnValue([]),
		parseReactionEvent: vi.fn().mockReturnValue([]),
		parseDeleteEvent: vi.fn().mockReturnValue([]),
		downloadMedia: vi.fn().mockResolvedValue(null),
	},
	telegram: {
		isStartCommand: vi.fn().mockReturnValue(false),
	},
}));

vi.mock("../lib/service-plans-context", () => ({
	fetchServicePlansSection: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@repo/config", () => ({
	config: {
		ai: {
			maxMessageLength: 4096,
			responseTimeoutMs: 300_000,
		},
	},
}));

// ── Imports (after mocks) ────────────────────────────────────────────

import { parseWebhookPayload } from "@repo/ai";
import { whatsappWebhookHandler } from "../lib/webhook-handlers";

const mockParseWebhookPayload = vi.mocked(parseWebhookPayload);

// ── Fixtures ─────────────────────────────────────────────────────────

const CHANNEL_FIXTURE = {
	id: "channel-1",
	enabled: true,
	webhookToken: "token-1",
	webhookSecret: null,
	encryptedApiToken: "enc-token",
	lastActivityAt: new Date(),
	agent: {
		id: "agent-1",
		enabled: true,
		organizationId: "org-1",
		systemPrompt: "You are helpful",
		model: "gpt-4.1",
		temperature: 0.7,
		maxHistoryLength: 50,
		enabledTools: [],
		greetingMessage: null,
		knowledgeBase: null,
		maintenanceMode: false,
		maintenanceMessage: null,
		servicePlansEnabled: false,
		promptSections: [],
		contextGapThresholdMinutes: 120,
		humanTakeoverHours: 4, // Enabled with 4-hour window
	},
};

const CONVERSATION_FIXTURE = {
	id: "conv-1",
	agentId: "agent-1",
	channelId: "channel-1",
	externalChatId: "142378635661318@lid",
	contactName: "Test User",
	contactId: "+1234567890",
	status: "active",
	messageCount: 5,
	lastMessageAt: new Date(),
	humanTakeoverAt: null as Date | null,
};

function makeRequest(body: unknown): Request {
	return new Request("https://example.com/webhook", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

async function flushBackground(ms = 100): Promise<void> {
	await vi.advanceTimersByTimeAsync(ms);
}

// ── Setup ────────────────────────────────────────────────────────────

beforeEach(() => {
	vi.clearAllMocks();
	vi.useFakeTimers({ shouldAdvanceTime: true });
	mockRedis.resetMultiCount();

	mockSendTextMessage.mockResolvedValue({ messageId: "msg-1" });
	mockGenerateAgentResponse.mockResolvedValue({
		text: "AI response",
		tokenCount: 100,
		latencyMs: 500,
		toolResults: null,
	});

	mockDb.aiAgentChannel.findUnique.mockResolvedValue(CHANNEL_FIXTURE);
	mockDb.aiConversation.findFirst.mockResolvedValue(null);
	mockDb.aiConversation.create.mockResolvedValue(CONVERSATION_FIXTURE);
	mockDb.aiConversation.findUnique.mockResolvedValue({
		...CONVERSATION_FIXTURE,
		status: "active",
	});
	mockDb.aiConversation.update.mockResolvedValue(CONVERSATION_FIXTURE);

	mockDb.aiMessage.findMany.mockResolvedValue([
		{ role: "user", content: "Hello", toolCalls: null },
	]);

	mockRedis.set.mockResolvedValue("OK");
	mockRedis.rpush.mockResolvedValue(1);
	mockRedis.del.mockResolvedValue(1);
	mockRedis.eval.mockResolvedValue(1);
	mockRedis.get.mockResolvedValue(null);
	mockRedis.expire.mockResolvedValue(1);
});

afterEach(() => {
	vi.useRealTimers();
});

// ── Tests ────────────────────────────────────────────────────────────

describe("Human Takeover - Bot Echo Detection", () => {
	it("does NOT trigger takeover when bot echo matches fingerprint", async () => {
		const botMessage = "Hello! How can I help you?";
		const fp = computeBotFingerprint(botMessage);

		// Bot sent this message — fingerprint is in Redis
		mockRedis.get.mockImplementation((key: string) => {
			if (key === `ai:bot-fp:${fp}`) {
				return Promise.resolve("1");
			}
			return Promise.resolve(null);
		});

		// Webhook delivers the echo as fromMe
		mockParseWebhookPayload.mockReturnValue([
			{
				chatId: "96176538947@s.whatsapp.net",
				messageId: "3EB0D75251003A853087B6",
				text: botMessage,
				fromMe: true,
			},
		]);

		const request = makeRequest({ test: true });
		whatsappWebhookHandler(request, "token-1");
		await flushBackground(2000);

		// Should delete the fingerprint key (consumed)
		expect(mockRedis.del).toHaveBeenCalledWith(`ai:bot-fp:${fp}`);

		// Should NOT update any conversation with humanTakeoverAt
		const updateCalls = mockDb.aiConversation.update.mock.calls;
		const takeoverCalls = updateCalls.filter(
			(c: unknown[]) =>
				(c[0] as Record<string, unknown>).data &&
				"humanTakeoverAt" in
					((c[0] as Record<string, unknown>).data as Record<
						string,
						unknown
					>),
		);
		expect(takeoverCalls).toHaveLength(0);
	});

	it("triggers takeover when fromMe text has NO matching fingerprint", async () => {
		// No fingerprint in Redis for this text
		mockRedis.get.mockResolvedValue(null);

		// Human typed this from their phone
		mockParseWebhookPayload.mockReturnValue([
			{
				chatId: "96176538947@s.whatsapp.net",
				messageId: "3EB0ABCDEF123456",
				text: "I'll handle this customer myself",
				fromMe: true,
			},
		]);

		// There's an active conversation for this chat
		mockDb.aiConversation.findFirst.mockResolvedValue(CONVERSATION_FIXTURE);

		const request = makeRequest({ test: true });
		whatsappWebhookHandler(request, "token-1");
		await flushBackground(2000);

		// Should set humanTakeoverAt on the conversation
		expect(mockDb.aiConversation.update).toHaveBeenCalledWith({
			where: { id: "conv-1" },
			data: {
				lastMessageAt: expect.any(Date),
				humanTakeoverAt: expect.any(Date),
			},
		});
	});

	it("triggers takeover for fromMe voice/media messages (no text)", async () => {
		mockRedis.get.mockResolvedValue(null);

		// Human sent a voice note from their phone — no text content
		mockParseWebhookPayload.mockReturnValue([
			{
				chatId: "96176538947@s.whatsapp.net",
				messageId: "3EB0VOICE123456",
				text: "", // Voice messages have no text
				fromMe: true,
			},
		]);

		mockDb.aiConversation.findFirst.mockResolvedValue(CONVERSATION_FIXTURE);

		const request = makeRequest({ test: true });
		whatsappWebhookHandler(request, "token-1");
		await flushBackground(2000);

		// Should still trigger takeover — bot never sends voice
		expect(mockDb.aiConversation.update).toHaveBeenCalledWith({
			where: { id: "conv-1" },
			data: {
				lastMessageAt: expect.any(Date),
				humanTakeoverAt: expect.any(Date),
			},
		});
	});

	it("does NOT set humanTakeoverAt when humanTakeoverHours is null (feature disabled)", async () => {
		// Agent has takeover disabled
		mockDb.aiAgentChannel.findUnique.mockResolvedValue({
			...CHANNEL_FIXTURE,
			agent: { ...CHANNEL_FIXTURE.agent, humanTakeoverHours: null },
		});

		mockRedis.get.mockResolvedValue(null);

		mockParseWebhookPayload.mockReturnValue([
			{
				chatId: "96176538947@s.whatsapp.net",
				messageId: "3EB0ABC123",
				text: "Human message from phone",
				fromMe: true,
			},
		]);

		mockDb.aiConversation.findFirst.mockResolvedValue(CONVERSATION_FIXTURE);

		const request = makeRequest({ test: true });
		whatsappWebhookHandler(request, "token-1");
		await flushBackground(2000);

		// The handler still bumps lastMessageAt and persists the admin message,
		// but it must not set humanTakeoverAt when the feature is disabled.
		expect(mockDb.aiConversation.update).toHaveBeenCalledWith({
			where: { id: "conv-1" },
			data: { lastMessageAt: expect.any(Date) },
		});
		const updateCalls = mockDb.aiConversation.update.mock.calls;
		const takeoverCalls = updateCalls.filter(
			(c: unknown[]) =>
				"humanTakeoverAt" in
				((c[0] as Record<string, unknown>).data as Record<
					string,
					unknown
				>),
		);
		expect(takeoverCalls).toHaveLength(0);
	});
});

describe("Human Takeover - JID Mismatch Handling", () => {
	it("finds conversation by prefix match when JID formats differ", async () => {
		mockRedis.get.mockResolvedValue(null);

		// Echo arrives with @s.whatsapp.net but conversation is stored with @lid
		mockParseWebhookPayload.mockReturnValue([
			{
				chatId: "96176538947@s.whatsapp.net",
				messageId: "3EB0JID123",
				text: "Let me check on this",
				fromMe: true,
			},
		]);

		// Exact match returns null, prefix match finds the conversation
		let findFirstCallCount = 0;
		mockDb.aiConversation.findFirst.mockImplementation(() => {
			findFirstCallCount++;
			if (findFirstCallCount === 1) {
				// Exact match — no result
				return Promise.resolve(null);
			}
			// Prefix match — found
			return Promise.resolve(CONVERSATION_FIXTURE);
		});

		const request = makeRequest({ test: true });
		whatsappWebhookHandler(request, "token-1");
		await flushBackground(2000);

		// Verify exact match is tried first
		expect(mockDb.aiConversation.findFirst).toHaveBeenCalledWith({
			where: {
				channelId: "channel-1",
				status: "active",
				externalChatId: "96176538947@s.whatsapp.net",
			},
			orderBy: { updatedAt: "desc" },
		});

		// Verify prefix fallback is tried second
		expect(mockDb.aiConversation.findFirst).toHaveBeenCalledWith({
			where: {
				channelId: "channel-1",
				status: "active",
				externalChatId: { startsWith: "96176538947@" },
			},
			orderBy: { updatedAt: "desc" },
		});

		// Should activate takeover
		expect(mockDb.aiConversation.update).toHaveBeenCalledWith({
			where: { id: "conv-1" },
			data: {
				lastMessageAt: expect.any(Date),
				humanTakeoverAt: expect.any(Date),
			},
		});
	});
});

describe("Human Takeover - AI Blocking During Takeover", () => {
	it("stores customer message but skips AI generation during active takeover", async () => {
		// Conversation has active takeover (set 30 minutes ago)
		const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
		const conversationWithTakeover = {
			...CONVERSATION_FIXTURE,
			humanTakeoverAt: thirtyMinutesAgo,
		};

		// Normal incoming customer message
		mockParseWebhookPayload.mockReturnValue([
			{
				chatId: "142378635661318@lid",
				messageId: "wa-msg-customer-1",
				text: "Hello, is anyone there?",
				contactName: "Customer",
				contactId: "+961123456",
			},
		]);

		mockDb.aiConversation.findFirst.mockResolvedValue(
			conversationWithTakeover,
		);
		mockDb.aiConversation.update.mockResolvedValue(
			conversationWithTakeover,
		);

		const request = makeRequest({ test: true });
		whatsappWebhookHandler(request, "token-1");
		await flushBackground(5000);

		// Should store the user message
		expect(mockDb.aiMessage.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					role: "user",
					content: "Hello, is anyone there?",
				}),
			}),
		);

		// Should NOT generate AI response
		expect(mockGenerateAgentResponse).not.toHaveBeenCalled();

		// Should NOT send any message
		expect(mockSendTextMessage).not.toHaveBeenCalled();
	});

	it("clears expired takeover and resumes AI on next customer message", async () => {
		// Conversation has expired takeover (set 5 hours ago, window is 4 hours)
		const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
		const conversationWithExpiredTakeover = {
			...CONVERSATION_FIXTURE,
			humanTakeoverAt: fiveHoursAgo,
		};

		mockParseWebhookPayload.mockReturnValue([
			{
				chatId: "142378635661318@lid",
				messageId: "wa-msg-resume-1",
				text: "Hello again",
				contactName: "Customer",
				contactId: "+961123456",
			},
		]);

		mockDb.aiConversation.findFirst.mockResolvedValue(
			conversationWithExpiredTakeover,
		);
		// First update (contactName/lastMessageAt) preserves the expired takeover,
		// then the takeover-clearing update sets it to null
		let updateCallCount = 0;
		mockDb.aiConversation.update.mockImplementation(() => {
			updateCallCount++;
			if (updateCallCount === 1) {
				// contactName/lastMessageAt update — preserve expired takeover
				return Promise.resolve(conversationWithExpiredTakeover);
			}
			// Second call clears takeover
			return Promise.resolve({
				...CONVERSATION_FIXTURE,
				humanTakeoverAt: null,
			});
		});

		const request = makeRequest({ test: true });
		whatsappWebhookHandler(request, "token-1");
		await flushBackground(5000);

		// Should clear the expired takeover (among other update calls)
		const updateCalls = mockDb.aiConversation.update.mock.calls;
		const clearTakeoverCall = updateCalls.find((c: unknown[]) => {
			const arg = c[0] as Record<string, unknown>;
			const data = arg.data as Record<string, unknown>;
			return data.humanTakeoverAt === null;
		});
		expect(clearTakeoverCall).toBeDefined();

		// Should attempt AI generation (takeover expired, AI resumes)
		expect(mockGenerateAgentResponse).toHaveBeenCalled();
	});
});

describe("Human Takeover - Fingerprint Tracking", () => {
	it("computeBotFingerprint produces consistent 16-char hex hashes", () => {
		const fp = computeBotFingerprint("AI response");
		expect(fp).toHaveLength(16);
		expect(fp).toMatch(/^[a-f0-9]{16}$/);
		// Same input = same output
		expect(computeBotFingerprint("AI response")).toBe(fp);
		// Different input = different output
		expect(computeBotFingerprint("Different text")).not.toBe(fp);
	});

	it("fingerprint is content-only — same text from different chats produces same hash", () => {
		const text = "Thank you for contacting us!";
		const fp1 = computeBotFingerprint(text);
		const fp2 = computeBotFingerprint(text);
		expect(fp1).toBe(fp2);
		expect(fp1).toHaveLength(16);
	});

	it("fingerprint truncates to first 200 chars", () => {
		const longText = "A".repeat(500);
		const truncatedText = "A".repeat(200);
		expect(computeBotFingerprint(longText)).toBe(
			computeBotFingerprint(truncatedText),
		);
	});
});

describe("isHumanTakeoverActive", () => {
	it("returns false when humanTakeoverAt is null", () => {
		expect(isHumanTakeoverActive(null, 4)).toBe(false);
	});

	it("returns false when humanTakeoverHours is null", () => {
		expect(isHumanTakeoverActive(new Date(), null)).toBe(false);
	});

	it("returns true when takeover is within the window", () => {
		const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
		expect(isHumanTakeoverActive(oneHourAgo, 4)).toBe(true);
	});

	it("returns false when takeover has expired", () => {
		const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
		expect(isHumanTakeoverActive(fiveHoursAgo, 4)).toBe(false);
	});

	it("handles edge case at exact expiry boundary", () => {
		const exactlyFourHoursAgo = new Date(
			Date.now() - 4 * 60 * 60 * 1000 - 1,
		);
		// Just barely expired
		expect(isHumanTakeoverActive(exactlyFourHoursAgo, 4)).toBe(false);
	});
});
