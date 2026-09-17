import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockRedis, mockAi } = vi.hoisted(() => ({
	mockDb: {
		aiConversation: {
			findUnique: vi.fn(),
			update: vi.fn().mockResolvedValue({}),
		},
		aiMessage: { create: vi.fn().mockResolvedValue({}) },
	},
	mockRedis: {
		set: vi.fn().mockResolvedValue("OK"),
		get: vi.fn(),
		expire: vi.fn(),
		eval: vi.fn().mockResolvedValue(1),
	},
	mockAi: {
		assistantMessageToParts: vi.fn().mockReturnValue([]),
		buildAgentMessages: vi.fn().mockReturnValue([]),
		buildAgentTelemetry: vi.fn().mockReturnValue({ isEnabled: false }),
		computeBotFingerprint: vi.fn().mockReturnValue("fp"),
		decryptToken: vi.fn().mockReturnValue("token"),
		executeEscalationGuard: vi.fn().mockResolvedValue(null),
		extractToolPromptOverrides: vi.fn().mockReturnValue({}),
		fetchServicePlansSection: vi.fn().mockResolvedValue(undefined),
		generateAgentResponse: vi.fn().mockResolvedValue({
			text: "AI response",
			toolResults: null,
		}),
		isHumanTakeoverActive: vi.fn().mockReturnValue(false),
		loadHistoryRows: vi.fn().mockResolvedValue([]),
		maybeEscalateUnknownContact: vi.fn().mockResolvedValue(null),
		modelMessagesToRoleContent: vi.fn().mockReturnValue([]),
		resolveAgentTools: vi
			.fn()
			.mockResolvedValue({ tools: {}, agentToolConfigs: [] }),
		resolveMaintenanceState: vi
			.fn()
			.mockReturnValue({ active: false, message: null }),
		sendTextMessage: vi
			.fn()
			.mockResolvedValue({ success: true, messageId: "wa-1" }),
		sendTypingIndicator: vi.fn().mockResolvedValue(undefined),
		shouldDeferToTeammate: vi.fn().mockResolvedValue(false),
	},
}));

let capturedProcessor:
	| ((job: Record<string, unknown>) => Promise<unknown>)
	| null = null;

vi.mock("bullmq", () => ({
	Worker: class MockWorker {
		constructor(_name: string, processor: unknown) {
			capturedProcessor = processor as typeof capturedProcessor;
		}
	},
}));
vi.mock("@repo/ai", () => mockAi);
vi.mock("@repo/database", () => ({ db: mockDb }));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@repo/config", () => ({
	config: {
		ai: { responseTimeoutMs: 300_000 },
		jobs: { workers: { aiChat: { concurrency: 1 } } },
	},
}));
vi.mock("../../connection", () => ({
	getRedisConnection: vi.fn(() => mockRedis),
}));
vi.mock("../../jobs/ai-followup.jobs", () => ({
	scheduleFollowUp: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../queues/ai-chat.queue", () => ({
	AI_CHAT_QUEUE_NAME: "ai-chat",
}));

import { createAiChatWorker } from "../ai-chat.worker";

const conversation = {
	id: "conv-1",
	channelId: "channel-1",
	externalChatId: "96170000000@s.whatsapp.net",
	contactName: "Customer",
	contactId: "96170000000",
	verifiedCustomerId: null,
	unknownEscalatedAt: null,
	humanTakeoverAt: null,
	lastMessageAt: new Date(),
	verifiedCustomer: null,
	channel: { provider: "whatsapp", encryptedApiToken: "enc" },
	agent: {
		id: "agent-1",
		organizationId: "org-1",
		systemPrompt: "You are helpful",
		model: "gpt-4.1",
		temperature: 0.3,
		maxHistoryLength: 20,
		enabledTools: [],
		knowledgeBase: null,
		servicePlansEnabled: false,
		servicePlanIds: [],
		promptSections: [],
		contextGapThresholdMinutes: 240,
		humanTakeoverHours: 1,
		followUpMinutes: null,
		maintenanceWindows: [],
	},
};

const job = {
	id: "job-1",
	data: { conversationId: "conv-1", channelId: "channel-1" },
	attemptsMade: 0,
	opts: { attempts: 3 },
};

describe("AI chat retry worker - teammate reply gate", () => {
	let processor: (job: Record<string, unknown>) => Promise<unknown>;

	beforeEach(() => {
		vi.clearAllMocks();
		mockDb.aiConversation.findUnique.mockResolvedValue(conversation);
		mockAi.shouldDeferToTeammate.mockResolvedValue(false);
		createAiChatWorker();
		if (!capturedProcessor) {
			throw new Error("Worker processor was not captured");
		}
		processor = capturedProcessor;
	});

	it("does not reply when the customer is answering a teammate", async () => {
		mockAi.shouldDeferToTeammate.mockResolvedValue(true);

		const result = await processor(job);

		expect(result).toEqual({
			success: true,
			error: "Customer is answering a teammate",
		});
		expect(mockAi.shouldDeferToTeammate).toHaveBeenCalledWith({
			conversationId: "conv-1",
		});
		expect(mockRedis.set).not.toHaveBeenCalled();
		expect(mockAi.generateAgentResponse).not.toHaveBeenCalled();
		expect(mockAi.sendTextMessage).not.toHaveBeenCalled();
	});

	it("replies when the gate does not defer", async () => {
		const result = await processor(job);

		expect(result).toEqual({ success: true });
		expect(mockAi.generateAgentResponse).toHaveBeenCalled();
		expect(mockAi.sendTextMessage).toHaveBeenCalled();
	});

	it("checks takeover before the gate", async () => {
		mockAi.isHumanTakeoverActive.mockReturnValueOnce(true);

		const result = await processor(job);

		expect(result).toEqual({
			success: true,
			error: "Human takeover active",
		});
		expect(mockAi.shouldDeferToTeammate).not.toHaveBeenCalled();
	});
});
