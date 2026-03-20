import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks (available inside vi.mock factories) ────────────────

const { mockRedis, mockDb, mockSendTextMessage, mockGenerateAgentResponse } =
	vi.hoisted(() => {
		// Track multi() call count so the buffer drains on second call
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
					// First call returns buffered messages, subsequent calls return empty
					// so the processing loop exits naturally
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

// ── Module mocks ──────────────────────────────────────────────────────

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
	triageBufferedMessages: vi.fn(),
	executeEscalationGuard: vi.fn().mockResolvedValue(null),
	extractToolPromptOverrides: vi.fn().mockReturnValue({}),
	stripToolAnnotation: vi.fn((text: string) => text),
	isWhishMoneyMessage: vi.fn().mockReturnValue(false),
	WHISH_MONEY_CONTEXT: "",
	computeBotFingerprint: vi.fn().mockReturnValue("mock-fp"),
	isHumanTakeoverActive: vi.fn().mockReturnValue(false),
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

// ── Imports (after mocks) ─────────────────────────────────────────────

import { parseWebhookPayload } from "@repo/ai";
import { queueAiChatRetry } from "@repo/jobs";
import { whatsappWebhookHandler } from "../lib/webhook-handlers";

// ── Helpers ───────────────────────────────────────────────────────────

const mockParseWebhookPayload = vi.mocked(parseWebhookPayload);
const mockQueueAiChatRetry = vi.mocked(queueAiChatRetry);

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
	},
};

const CONVERSATION_FIXTURE = {
	id: "conv-1",
	agentId: "agent-1",
	channelId: "channel-1",
	externalChatId: "chat-1",
	contactName: "Test User",
	contactId: "+1234567890",
	status: "active",
	messageCount: 0,
	lastMessageAt: new Date(),
};

function makeRequest(body: unknown): Request {
	return new Request("https://example.com/webhook", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

/**
 * Wait for background processing to complete.
 * whatsappWebhookHandler fires handleMessages in background via .catch(),
 * so we need to flush the microtask/promise queue.
 */
async function flushBackground(ms = 100): Promise<void> {
	await vi.advanceTimersByTimeAsync(ms);
}

// ── Setup ─────────────────────────────────────────────────────────────

beforeEach(() => {
	vi.clearAllMocks();
	vi.useFakeTimers({ shouldAdvanceTime: true });
	mockRedis.resetMultiCount();

	// Restore default implementations (clearAllMocks only clears call history)
	mockSendTextMessage.mockResolvedValue({ messageId: "msg-1" });
	mockGenerateAgentResponse.mockResolvedValue({
		text: "AI response",
		tokenCount: 100,
		latencyMs: 500,
		toolResults: null,
	});

	mockParseWebhookPayload.mockReturnValue([
		{
			chatId: "chat-1",
			messageId: "wa-msg-1",
			text: "Hello",
			contactName: "Test User",
			contactId: "+1234567890",
		},
	]);

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

	// Lock acquired successfully by default
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

// ── Tests ─────────────────────────────────────────────────────────────

describe("Webhook Handlers - Lock TTL & Ownership", () => {
	it("acquires lock with unique owner ID, not a static value", async () => {
		const request = makeRequest({ test: true });
		whatsappWebhookHandler(request, "token-1");

		// Advance past the 3s settle delay + processing time
		await flushBackground(5000);

		// The lock set call should use a dynamic value, not "1"
		const setCalls = mockRedis.set.mock.calls;
		const lockCall = setCalls.find(
			(c: unknown[]) =>
				typeof c[0] === "string" &&
				(c[0] as string).startsWith("ai:lock:"),
		);
		expect(lockCall).toBeDefined();
		// lockCall: [lockKey, lockValue, "EX", 120, "NX"]
		const lockValue = lockCall?.[1] as string;
		expect(lockValue).not.toBe("1");
		expect(lockValue).not.toBe("clear");
		expect(lockValue).toMatch(/^\d+-[a-z0-9]+$/);
	});

	it("releases lock atomically with Lua script using owner value", async () => {
		const request = makeRequest({ test: true });
		whatsappWebhookHandler(request, "token-1");
		// Need enough time for: settle delay (3s) + generation + buffer drain loop
		await flushBackground(10_000);

		// Should call redis.eval with the Lua script
		expect(mockRedis.eval).toHaveBeenCalled();
		const evalCall = mockRedis.eval.mock.calls[0];
		// Lua script checks ownership before deleting
		expect(evalCall[0]).toContain('redis.call("get",KEYS[1])');
		expect(evalCall[0]).toContain('redis.call("del",KEYS[1])');
		// Should pass the lock key and owner value
		const lockKey = evalCall[2] as string;
		const ownerValue = evalCall[3] as string;
		expect(lockKey).toContain("ai:lock:");
		expect(ownerValue).toMatch(/^\d+-[a-z0-9]+$/);
	});

	it("sets up lock renewal interval that calls expire", async () => {
		// Make generation take a while so we can observe the renewal
		mockGenerateAgentResponse.mockImplementation(
			() =>
				new Promise((resolve) =>
					setTimeout(
						() =>
							resolve({
								text: "response",
								tokenCount: 10,
								latencyMs: 100,
								toolResults: null,
							}),
						35_000,
					),
				),
		);

		const request = makeRequest({ test: true });
		whatsappWebhookHandler(request, "token-1");

		// Wait for lock acquisition and settle delay
		await flushBackground(4000);

		// Capture the lock value that was set
		const setCalls = mockRedis.set.mock.calls;
		const lockCall = setCalls.find(
			(c: unknown[]) =>
				typeof c[0] === "string" &&
				(c[0] as string).startsWith("ai:lock:"),
		);
		const lockValue = lockCall?.[1] as string;

		// Mock redis.get to return the lock value (we still own it)
		mockRedis.get.mockResolvedValue(lockValue);

		// Advance past the 30s renewal interval
		await flushBackground(31_000);

		// Should have called get to check ownership
		const getCalls = mockRedis.get.mock.calls.filter(
			(c: unknown[]) =>
				typeof c[0] === "string" &&
				(c[0] as string).startsWith("ai:lock:"),
		);
		expect(getCalls.length).toBeGreaterThanOrEqual(1);

		// Should have called expire to renew the TTL
		expect(mockRedis.expire).toHaveBeenCalledWith(
			expect.stringContaining("ai:lock:"),
			120,
		);

		// Let generation complete
		await flushBackground(10_000);
	});
});

describe("Webhook Handlers - /clear Command", () => {
	it("returns quickly with retry message when lock cannot be acquired", async () => {
		mockParseWebhookPayload.mockReturnValue([
			{
				chatId: "chat-1",
				messageId: "wa-msg-clear",
				text: "/clear",
				contactName: "Test User",
				contactId: "+1234567890",
			},
		]);

		// Lock is held by another processor — NX always fails
		mockRedis.set.mockResolvedValue(null);

		const request = makeRequest({ test: true });
		whatsappWebhookHandler(request, "token-1");

		// Should complete within ~5 seconds (5 retries × 1s), not 60s
		await flushBackground(7_000);

		// Should send "try again" message
		expect(mockSendTextMessage).toHaveBeenCalledWith(
			"whatsapp",
			"decrypted-token",
			"chat-1",
			expect.stringContaining("try /clear again"),
		);

		// Should NOT have sent "Conversation cleared"
		const clearMsgCalls = mockSendTextMessage.mock.calls.filter(
			(c: unknown[]) =>
				typeof c[3] === "string" &&
				(c[3] as string).includes("Conversation cleared"),
		);
		expect(clearMsgCalls).toHaveLength(0);
	});

	it("clears conversation when lock is acquired", async () => {
		mockParseWebhookPayload.mockReturnValue([
			{
				chatId: "chat-1",
				messageId: "wa-msg-clear",
				text: "/clear",
				contactName: "Test User",
				contactId: "+1234567890",
			},
		]);

		// Lock acquired on first try
		mockRedis.set.mockResolvedValue("OK");

		const request = makeRequest({ test: true });
		whatsappWebhookHandler(request, "token-1");
		await flushBackground(2000);

		// Should clear buffer and update conversation status
		expect(mockDb.aiConversation.updateMany).toHaveBeenCalledWith({
			where: {
				channelId: "channel-1",
				externalChatId: "chat-1",
				status: "active",
			},
			data: { status: "cleared" },
		});

		// Should send "Conversation cleared" message
		expect(mockSendTextMessage).toHaveBeenCalledWith(
			"whatsapp",
			"decrypted-token",
			"chat-1",
			"Conversation cleared. Send a message to start fresh.",
		);
	});
});

describe("Webhook Handlers - BullMQ Retry on Transient Errors", () => {
	it("enqueues retry via BullMQ for transient AI generation errors", async () => {
		mockGenerateAgentResponse.mockRejectedValue(
			new Error("API rate limit exceeded"),
		);

		const request = makeRequest({ test: true });
		whatsappWebhookHandler(request, "token-1");
		await flushBackground(5000);

		// Should queue a retry
		expect(mockQueueAiChatRetry).toHaveBeenCalledWith({
			conversationId: "conv-1",
			channelId: "channel-1",
		});

		// Should send the soft retry message, not the hard fallback
		expect(mockSendTextMessage).toHaveBeenCalledWith(
			"whatsapp",
			"decrypted-token",
			"chat-1",
			"Give me a moment, I'm still working on this...",
		);
	});

	it("does NOT enqueue retry for AI_InvalidToolInputError", async () => {
		const toolError = new Error("Invalid tool input");
		toolError.name = "AI_InvalidToolInputError";
		mockGenerateAgentResponse.mockRejectedValue(toolError);

		const request = makeRequest({ test: true });
		whatsappWebhookHandler(request, "token-1");
		await flushBackground(5000);

		// Should NOT queue a retry for tool errors
		expect(mockQueueAiChatRetry).not.toHaveBeenCalled();

		// Should send the hard fallback message
		expect(mockSendTextMessage).toHaveBeenCalledWith(
			"whatsapp",
			"decrypted-token",
			"chat-1",
			"I'm having trouble right now. Please try again shortly.",
		);
	});

	it("does NOT enqueue retry for AI_NoSuchToolError", async () => {
		const toolError = new Error("Tool not found");
		toolError.name = "AI_NoSuchToolError";
		mockGenerateAgentResponse.mockRejectedValue(toolError);

		const request = makeRequest({ test: true });
		whatsappWebhookHandler(request, "token-1");
		await flushBackground(5000);

		expect(mockQueueAiChatRetry).not.toHaveBeenCalled();
	});
});

describe("Webhook Handlers - Normal Flow", () => {
	it("processes a normal message end-to-end", async () => {
		const request = makeRequest({ test: true });
		const response = await whatsappWebhookHandler(request, "token-1");
		await flushBackground(5000);

		// Returns 200 immediately
		expect(response.status).toBe(200);

		// Should store user message
		expect(mockDb.aiMessage.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					role: "user",
					content: "Hello",
				}),
			}),
		);

		// Should generate AI response
		expect(mockGenerateAgentResponse).toHaveBeenCalled();

		// Should send AI response
		expect(mockSendTextMessage).toHaveBeenCalledWith(
			"whatsapp",
			"decrypted-token",
			"chat-1",
			"AI response",
		);
	});

	it("returns 200 for disabled channel", async () => {
		mockDb.aiAgentChannel.findUnique.mockResolvedValue({
			...CHANNEL_FIXTURE,
			enabled: false,
		});

		const request = makeRequest({ test: true });
		const response = await whatsappWebhookHandler(request, "token-1");
		await flushBackground(1000);

		expect(response.status).toBe(200);
		expect(mockGenerateAgentResponse).not.toHaveBeenCalled();
	});

	it("skips processing when lock is already held", async () => {
		// Lock already held by another processor
		mockRedis.set.mockResolvedValue(null);

		const request = makeRequest({ test: true });
		whatsappWebhookHandler(request, "token-1");
		await flushBackground(5000);

		// Should buffer the message
		expect(mockRedis.rpush).toHaveBeenCalled();

		// Should NOT generate (another processor will handle it)
		expect(mockGenerateAgentResponse).not.toHaveBeenCalled();
	});
});
