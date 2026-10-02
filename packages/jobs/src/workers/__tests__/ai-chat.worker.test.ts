import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockRedis, mockAi, mockTeammateWait, mockFollowUps } =
	vi.hoisted(() => ({
		mockTeammateWait: {
			clearAwaitingHuman: vi.fn().mockResolvedValue(undefined),
			markAwaitingHuman: vi.fn().mockResolvedValue(undefined),
			handleTeammateWait: vi.fn().mockResolvedValue({ success: true }),
		},
		mockFollowUps: {
			settleCheckBackReplies: vi.fn().mockResolvedValue(undefined),
			loadOutreachContext: vi.fn().mockResolvedValue(undefined),
			sendVoiceReply: vi.fn().mockResolvedValue(false),
		},
		mockDb: {
			aiConversation: {
				findUnique: vi.fn(),
				update: vi.fn().mockResolvedValue({}),
			},
			aiMessage: { create: vi.fn().mockResolvedValue({ id: "msg-1" }) },
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
			resolveAgentCredentials: vi
				.fn()
				.mockReturnValue({ provider: "openrouter", apiKey: "k" }),
			executeEscalationGuard: vi.fn().mockResolvedValue(null),
			extractToolPromptOverrides: vi.fn().mockReturnValue({}),
			fetchServicePlansSection: vi.fn().mockResolvedValue(undefined),
			teammateWaitAlertEnabled: vi.fn().mockResolvedValue(false),
			formatAwaitingTeammateNote: vi
				.fn()
				.mockImplementation(
					(m: number) => `[Context Notice: waiting ${m}]`,
				),
			generateAgentResponse: vi.fn().mockResolvedValue({
				text: "AI response",
				toolResults: null,
			}),
			isHumanTakeoverActive: vi.fn().mockReturnValue(false),
			loadHistoryRows: vi.fn().mockResolvedValue([]),
			loadVerifiedCustomerSummary: vi.fn().mockResolvedValue(undefined),
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
vi.mock("../../lib/bot-follow-ups", () => ({
	settleCheckBackReplies: mockFollowUps.settleCheckBackReplies,
}));
vi.mock("../../lib/outreach", () => ({
	loadOutreachContext: mockFollowUps.loadOutreachContext,
}));
vi.mock("../../lib/voice-reply", () => ({
	sendVoiceReply: mockFollowUps.sendVoiceReply,
}));
vi.mock("../../queues/ai-chat.queue", () => ({
	AI_CHAT_QUEUE_NAME: "ai-chat",
}));
vi.mock("../../jobs/ai-teammate-wait.jobs", () => ({
	clearAwaitingHuman: mockTeammateWait.clearAwaitingHuman,
	markAwaitingHuman: mockTeammateWait.markAwaitingHuman,
	TEAMMATE_BOT_TAKEOVER_AFTER_MS: 30 * 60_000,
}));
vi.mock("../../lib/teammate-wait", () => ({
	handleTeammateWait: mockTeammateWait.handleTeammateWait,
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
		provider: "openrouter",
		encryptedApiKey: "encrypted-key",
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
		mockAi.shouldDeferToTeammate.mockResolvedValue({
			defer: true,
			needsAction: false,
		});

		const result = await processor(job);

		expect(result).toEqual({
			success: true,
			error: "Customer is answering a teammate",
		});
		expect(mockAi.shouldDeferToTeammate).toHaveBeenCalledWith({
			conversationId: "conv-1",
			credentials: { provider: "openrouter", apiKey: "k" },
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

	it("settles check-back answers after the reply", async () => {
		await processor(job);

		expect(mockFollowUps.settleCheckBackReplies).toHaveBeenCalledWith({
			conversationId: "conv-1",
			credentials: { provider: "openrouter", apiKey: "k" },
			botReply: "AI response",
			escalatedThisTurn: false,
		});
		expect(mockFollowUps.sendVoiceReply).toHaveBeenCalledWith(
			expect.objectContaining({
				assistantMessageId: "msg-1",
				triggeredByVoice: false,
			}),
		);
	});
});

describe("AI chat retry worker - forced replies and the teammate wait", () => {
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

	it("bypassDeferral skips the teammate gate and replies", async () => {
		mockAi.shouldDeferToTeammate.mockResolvedValue({
			defer: true,
			needsAction: true,
		});

		const result = await processor({
			...job,
			data: { ...job.data, bypassDeferral: true },
		});

		expect(result).toEqual({ success: true });
		expect(mockAi.shouldDeferToTeammate).not.toHaveBeenCalled();
		expect(mockAi.sendTextMessage).toHaveBeenCalled();
		expect(mockTeammateWait.clearAwaitingHuman).toHaveBeenCalledWith(
			"conv-1",
		);
	});

	it("adds the awaiting-teammate notice to a teammate-wait reply", async () => {
		mockDb.aiConversation.findUnique.mockResolvedValue({
			...conversation,
			awaitingHumanSince: new Date(Date.now() - 31 * 60_000),
		});

		await processor({
			...job,
			data: {
				...job.data,
				bypassDeferral: true,
				contextNotice: "awaiting-teammate",
			},
		});

		expect(mockAi.formatAwaitingTeammateNote).toHaveBeenCalledWith(
			31,
			false,
		);
		expect(mockAi.buildAgentMessages).toHaveBeenCalledWith(
			expect.objectContaining({
				extraNotice: "[Context Notice: waiting 31]",
			}),
		);
	});

	it("starts the teammate wait when a deferred message needs action", async () => {
		mockAi.shouldDeferToTeammate.mockResolvedValue({
			defer: true,
			needsAction: true,
		});

		await processor(job);

		expect(mockTeammateWait.markAwaitingHuman).toHaveBeenCalledWith({
			conversationId: "conv-1",
			channelId: "channel-1",
			origin: "deferral",
		});
		expect(mockAi.sendTextMessage).not.toHaveBeenCalled();
	});

	it("routes teammate-wait jobs to their handler", async () => {
		const waitJob = {
			...job,
			name: "teammate-wait",
			data: { ...job.data, stage: "alert", origin: "takeover" },
		};

		await processor(waitJob);

		expect(mockTeammateWait.handleTeammateWait).toHaveBeenCalledWith(
			waitJob.data,
		);
		expect(mockDb.aiConversation.findUnique).not.toHaveBeenCalled();
	});
});
