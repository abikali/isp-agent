import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, redis, ai, jobs } = vi.hoisted(() => ({
	db: {
		aiConversation: { findUnique: vi.fn(), update: vi.fn() },
		aiMessage: { findFirst: vi.fn(), create: vi.fn() },
		botFollowUp: {
			findFirst: vi.fn(),
			update: vi.fn(),
			create: vi.fn(),
		},
		task: { findUnique: vi.fn() },
	},
	redis: {
		set: vi.fn(),
		get: vi.fn(),
		del: vi.fn(),
		eval: vi.fn(),
	},
	ai: {
		assistantMessageToParts: vi.fn(() => []),
		buildAgentMessages: vi.fn(() => []),
		buildAgentTelemetry: vi.fn(() => ({})),
		buildFollowUpInstruction: vi.fn(() => "[Follow-up check: …]"),
		buildPostEscalationInstruction: vi.fn(() => "[Check-back: …]"),
		computeBotFingerprint: vi.fn(() => "fp"),
		decryptToken: vi.fn(() => "token"),
		fetchServicePlansSection: vi.fn(async () => undefined),
		generateAgentResponse: vi.fn(),
		isHumanTakeoverActive: vi.fn(() => false),
		isNoFollowUpReply: (t: string) => /NO_FOLLOW_UP/.test(t),
		isWithinFollowUpHours: vi.fn(() => true),
		loadHistoryRows: vi.fn(async () => []),
		resolveAgentCredentials: vi.fn(() => ({
			provider: "openrouter",
			apiKey: "k",
		})),
		resolveFollowUpFireAt: vi.fn(() => new Date("2026-10-01T06:30:00Z")),
		resolveMaintenanceState: vi.fn(() => ({ active: false })),
		sendTextMessage: vi.fn(),
		sendTypingIndicator: vi.fn(async () => undefined),
		stripInternalMarkers: (t: string) => t,
	},
	jobs: {
		countRecentFollowUps: vi.fn(),
		scheduleFollowUp: vi.fn(async () => undefined),
	},
}));

vi.mock("@repo/ai", () => ai);
vi.mock("@repo/database", () => ({ db }));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../../connection", () => ({ getRedisConnection: () => redis }));
vi.mock("../../jobs/ai-followup.jobs", () => jobs);

import { runFollowUp, runPostEscalationCheck } from "../ai-follow-up";

const NOW = Date.now();

function conversation(overrides: Record<string, unknown> = {}) {
	return {
		id: "conv-1",
		channelId: "ch-1",
		externalChatId: "96170123456@s.whatsapp.net",
		contactName: "Joseph",
		contactId: "96170123456",
		status: "active",
		followUpMuted: false,
		followUpAttempts: 0,
		followUpDueAt: null,
		humanTakeoverAt: null,
		lastMessageAt: new Date(NOW - 30 * 60_000),
		verifiedCustomerId: "cust-1",
		verifiedCustomer: null,
		channel: { provider: "whatsapp", encryptedApiToken: "enc" },
		agent: {
			id: "agent-1",
			organizationId: "org-1",
			enabled: true,
			encryptedApiKey: "enc-key",
			provider: "openrouter",
			model: "gpt-4.1",
			temperature: 0,
			systemPrompt: "",
			knowledgeBase: null,
			maxHistoryLength: 20,
			servicePlansEnabled: false,
			servicePlanIds: [],
			promptSections: [],
			contextGapThresholdMinutes: 240,
			humanTakeoverHours: 1,
			postEscalationCheckMinutes: 1440,
			followUpMinutes: 5,
			followUpMessage: null,
			followUpMaxAttempts: 1,
			followUpRepeatMinutes: 1440,
			followUpWindowStart: "09:00",
			followUpWindowEnd: "20:30",
			followUpWeeklyCap: 3,
			maintenanceWindows: [],
		},
		...overrides,
	};
}

const row = { id: "fu-1", conversationId: "conv-1", taskId: "task-1" };

function lastStatusUpdate() {
	const calls = db.botFollowUp.update.mock.calls;
	return calls[calls.length - 1]?.[0]?.data;
}

beforeEach(() => {
	vi.clearAllMocks();
	db.aiConversation.findUnique.mockResolvedValue(conversation());
	db.aiConversation.update.mockResolvedValue({});
	db.task.findUnique.mockResolvedValue({
		title: "AI Escalation: No internet",
		status: "OPEN",
		followUpStatus: null,
		createdAt: new Date(NOW - 24 * 60 * 60_000),
	});
	// user message in last 12h → none; admin since task → none
	db.aiMessage.findFirst.mockImplementation(
		async (args: { where: { role?: string }; orderBy?: unknown }) => {
			if (args.orderBy) {
				return {
					role: "assistant",
					error: null,
					deliveryStatus: null,
					createdAt: new Date(NOW - 23 * 60 * 60_000),
				};
			}
			return null;
		},
	);
	db.aiMessage.create.mockResolvedValue({ id: "msg-1" });
	db.botFollowUp.findFirst.mockResolvedValue(null);
	db.botFollowUp.update.mockResolvedValue({});
	db.botFollowUp.create.mockResolvedValue({});
	jobs.countRecentFollowUps.mockResolvedValue(0);
	redis.set.mockResolvedValue("OK");
	redis.get.mockResolvedValue(null);
	redis.del.mockResolvedValue(1);
	redis.eval.mockResolvedValue(1);
	ai.isWithinFollowUpHours.mockReturnValue(true);
	ai.isHumanTakeoverActive.mockReturnValue(false);
	ai.resolveMaintenanceState.mockReturnValue({ active: false });
	ai.generateAgentResponse.mockResolvedValue({
		text: "Did the team reach you? Is it working now?",
	});
	ai.sendTextMessage.mockResolvedValue({ success: true, messageId: "wa-1" });
});

describe("runPostEscalationCheck", () => {
	it("asks once and records the send", async () => {
		const result = await runPostEscalationCheck(row);

		expect(result).toEqual({ status: "sent" });
		expect(ai.buildPostEscalationInstruction).toHaveBeenCalledWith(
			24,
			"AI Escalation: No internet",
			false,
		);
		expect(db.aiMessage.create.mock.calls[0]?.[0]?.data).toMatchObject({
			role: "assistant",
			isFollowUp: true,
		});
		expect(lastStatusUpdate()).toMatchObject({
			status: "sent",
			messageText: "Did the team reach you? Is it working now?",
			aiMessageId: "msg-1",
		});
		// One question, one attempt: no silence nudge after it.
		expect(jobs.scheduleFollowUp).not.toHaveBeenCalled();
	});

	const skips: Array<[string, () => void]> = [
		[
			"agent_disabled",
			() =>
				db.aiConversation.findUnique.mockResolvedValue(
					conversation({
						agent: { ...conversation().agent, enabled: false },
					}),
				),
		],
		[
			"no_api_key",
			() =>
				db.aiConversation.findUnique.mockResolvedValue(
					conversation({
						agent: {
							...conversation().agent,
							encryptedApiKey: null,
						},
					}),
				),
		],
		[
			"conversation_not_active",
			() =>
				db.aiConversation.findUnique.mockResolvedValue(
					conversation({ status: "archived" }),
				),
		],
		[
			"muted",
			() =>
				db.aiConversation.findUnique.mockResolvedValue(
					conversation({ followUpMuted: true }),
				),
		],
		[
			"human_takeover",
			() => ai.isHumanTakeoverActive.mockReturnValue(true),
		],
		[
			"maintenance",
			() => ai.resolveMaintenanceState.mockReturnValue({ active: true }),
		],
		[
			"task_resolved",
			() =>
				db.task.findUnique.mockResolvedValue({
					title: "x",
					status: "OPEN",
					followUpStatus: "resolved",
					createdAt: new Date(NOW - 3600_000),
				}),
		],
		[
			"customer_active",
			() =>
				db.aiMessage.findFirst.mockImplementation(
					async (args: { where: { role?: string } }) =>
						args.where.role === "user" ? { id: "u1" } : null,
				),
		],
		[
			"already_checked",
			() => db.botFollowUp.findFirst.mockResolvedValue({ id: "fu-0" }),
		],
		["weekly_cap", () => jobs.countRecentFollowUps.mockResolvedValue(3)],
		[
			"last_reply_not_delivered",
			() =>
				db.aiMessage.findFirst.mockImplementation(
					async (args: { orderBy?: unknown }) =>
						args.orderBy
							? {
									role: "assistant",
									error: null,
									deliveryStatus: "failed",
									createdAt: new Date(NOW - 3600_000),
								}
							: null,
				),
		],
		[
			"model_declined",
			() =>
				ai.generateAgentResponse.mockResolvedValue({
					text: "NO_FOLLOW_UP",
				}),
		],
	];

	it.each(skips)("skips with %s", async (reason, arrange) => {
		arrange();
		const result = await runPostEscalationCheck(row);
		expect(result).toEqual({ status: "skipped", skipReason: reason });
		expect(lastStatusUpdate()).toMatchObject({
			status: "skipped",
			skipReason: reason,
		});
		expect(ai.sendTextMessage).not.toHaveBeenCalled();
	});

	it("moves a late check-back into the follow-up window", async () => {
		ai.isWithinFollowUpHours.mockReturnValue(false);
		const result = await runPostEscalationCheck(row);
		expect(result).toEqual({ status: "rescheduled" });
		expect(lastStatusUpdate()).toEqual({
			status: "scheduled",
			dueAt: new Date("2026-10-01T06:30:00Z"),
		});
	});

	it("retries later when the customer is mid-conversation", async () => {
		redis.set.mockResolvedValue(null);
		const result = await runPostEscalationCheck(row);
		expect(result).toEqual({ status: "rescheduled" });
		expect(lastStatusUpdate()?.status).toBe("scheduled");
		expect(ai.sendTextMessage).not.toHaveBeenCalled();
	});
});

describe("runFollowUp (silence nudge)", () => {
	it("writes a Bot follow-ups row for a sent nudge", async () => {
		db.aiConversation.findUnique.mockResolvedValue(
			conversation({ lastMessageAt: new Date(NOW - 10 * 60_000) }),
		);
		db.aiMessage.findFirst.mockResolvedValue({
			role: "assistant",
			error: null,
			deliveryStatus: null,
			createdAt: new Date(NOW - 10 * 60_000),
		});
		ai.generateAgentResponse.mockResolvedValue({ text: "Still there?" });

		const result = await runFollowUp({
			conversationId: "conv-1",
			repliedAt: new Date(NOW - 10 * 60_000),
		});

		expect(result.sent).toBe(true);
		expect(db.botFollowUp.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				type: "silence",
				channel: "bot",
				status: "sent",
				conversationId: "conv-1",
				customerId: "cust-1",
				messageText: "Still there?",
				aiMessageId: "msg-1",
			}),
		});
	});
});
