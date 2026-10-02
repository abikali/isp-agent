import { beforeEach, describe, expect, it, vi } from "vitest";

const { db } = vi.hoisted(() => ({
	db: {
		task: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
		aiConversation: { findUnique: vi.fn() },
		aiMessage: { findMany: vi.fn() },
		customer: { findMany: vi.fn(), findUnique: vi.fn() },
		aiAgentToolConfig: { findFirst: vi.fn() },
		aiAgent: { findUnique: vi.fn() },
		botFollowUp: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
	},
}));

vi.mock("@repo/database", () => ({ db }));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { escalateTelegram } from "../escalate-telegram";

const context = {
	organizationId: "org-1",
	agentId: "agent-1",
	credentials: { provider: "openrouter", apiKey: "test" } as const,
	conversationId: "conv-1",
	externalChatId: "chat-1",
	toolConfig: { telegramBotToken: "bot-token", telegramChatIds: ["123"] },
};

const args = {
	reason: "Customer offline",
	priority: "medium" as const,
	category: "support" as const,
	summary: "Customer reports no internet.",
	actionRequired: "Check the line",
};

const fetchMock = vi.fn();

function run(toolCallId: string) {
	const t = escalateTelegram.factory(context);
	return (t as any).execute(args, { toolCallId, messages: [] });
}

function sentText(): string {
	const body = fetchMock.mock.calls[0]?.[1]?.body as string;
	return JSON.parse(body).text as string;
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubEnv("SITE_URL", "https://cp.example.com");
	vi.stubGlobal("fetch", fetchMock);
	fetchMock.mockResolvedValue({
		status: 200,
		json: async () => ({ ok: true }),
	});
	db.task.findFirst.mockResolvedValue(null);
	db.task.create.mockResolvedValue({ id: "task-new" });
	db.task.update.mockResolvedValue({ id: "task-1" });
	db.aiAgent.findUnique.mockResolvedValue({
		organizationId: "org-1",
		postEscalationCheckMinutes: null,
		followUpWindowStart: "09:00",
		followUpWindowEnd: "20:30",
	});
	db.botFollowUp.findFirst.mockResolvedValue(null);
	db.botFollowUp.create.mockResolvedValue({});
	db.botFollowUp.update.mockResolvedValue({});
	db.aiConversation.findUnique.mockResolvedValue({
		contactId: "96170000000",
		contactName: "Joseph",
		verifiedCustomerId: null,
		agent: {
			organizationId: "org-1",
			organization: { slug: "libancom", name: "LibanCom" },
		},
	});
	db.aiMessage.findMany.mockResolvedValue([
		{
			role: "user",
			content: "no internet since morning",
			createdAt: new Date(Date.now() - 60_000),
		},
	]);
	db.customer.findMany.mockResolvedValue([]);
	db.aiAgentToolConfig.findFirst.mockResolvedValue(null);
});

describe("escalate-telegram", () => {
	it("sends the caller's own summary, action, priority and category", async () => {
		const out = await run("call_1");
		expect(out.success).toBe(true);
		expect(out.message).toContain("priority: medium");
		const text = sentText();
		expect(text).toContain("<b>MEDIUM</b> — Support · LibanCom");
		expect(text).toContain("Customer reports no internet.");
		expect(text).toContain("<b>Action:</b> Check the line");
		expect(text).toContain("raised by the bot");
		expect(text).toContain(
			"https://cp.example.com/app/libancom/conversations/conv-1",
		);
		await vi.waitFor(() => expect(db.task.create).toHaveBeenCalled());
		const created = db.task.create.mock.calls[0]?.[0]?.data;
		expect(created.priority).toBe("MEDIUM");
		expect(created.category).toBe("SUPPORT");
		expect(created.description).toContain("Customer reports no internet.");
	});

	it("labels safety-net and teammate-wait escalations", async () => {
		await run("guard-conv-1");
		expect(sentText()).toContain("safety net");
		fetchMock.mockClear();
		await run("awaiting-conv-1");
		expect(sentText()).toContain("teammate did not reply");
	});

	describe("repeat calls", () => {
		const openTask = (minutesAgo: number, status = "OPEN") => ({
			id: "task-1",
			status,
			createdAt: new Date(Date.now() - minutesAgo * 60_000),
		});

		it("updates the open task instead of alerting again within 6 hours", async () => {
			db.task.findFirst.mockResolvedValueOnce(openTask(90));
			const out = await run("call_2");
			expect(out.success).toBe(true);
			expect(out.message).toContain("already active");
			expect(fetchMock).not.toHaveBeenCalled();
			expect(db.task.update.mock.calls[0]?.[0]?.where).toEqual({
				id: "task-1",
			});
		});

		it("alerts again once the team closed the earlier task", async () => {
			db.task.findFirst.mockResolvedValueOnce(openTask(90, "COMPLETED"));
			await run("call_2");
			expect(fetchMock).toHaveBeenCalled();
		});

		it("always lets a high-priority call through", async () => {
			db.task.findFirst.mockResolvedValueOnce(openTask(90));
			const t = escalateTelegram.factory(context);
			await (t as any).execute(
				{ ...args, priority: "high" },
				{ toolCallId: "call_2", messages: [] },
			);
			expect(fetchMock).toHaveBeenCalled();
		});

		it("keeps the 6-hour rule to the bot: a teammate-wait alert still goes out", async () => {
			db.task.findFirst.mockResolvedValueOnce(openTask(90));
			await run("awaiting-conv-1");
			expect(fetchMock).toHaveBeenCalled();
		});

		it("never sends the same alert twice within 10 minutes, whoever calls", async () => {
			db.task.findFirst.mockResolvedValueOnce(openTask(3));
			await run("awaiting-conv-1");
			expect(fetchMock).not.toHaveBeenCalled();
		});
	});

	it("shows an unverified phone match without verifying it", async () => {
		db.customer.findMany.mockResolvedValue([
			{ id: "c1", status: "PENDING" },
		]);
		db.customer.findUnique.mockResolvedValue({
			firstName: "Joseph",
			lastName: "Helo",
			phone: "+96170000000",
			email: null,
			username: "joehelohome",
			address: null,
			accountNumber: "75172",
			status: "PENDING",
			plan: null,
			station: null,
		});
		await run("unknown-conv-1");
		const text = sentText();
		expect(text).toContain("phone match, not verified · local PENDING");
		expect(text).toContain("unknown-contact rule");
		await vi.waitFor(() => expect(db.task.create).toHaveBeenCalled());
		expect(db.task.create.mock.calls[0]?.[0]?.data.customerId).toBeNull();
	});

	describe("check-back after an escalation", () => {
		beforeEach(() => {
			db.aiAgent.findUnique.mockResolvedValue({
				organizationId: "org-1",
				postEscalationCheckMinutes: 1440,
				followUpWindowStart: "09:00",
				followUpWindowEnd: "20:30",
			});
		});

		it("schedules one check-back for a new escalation task", async () => {
			await run("call_1");
			await vi.waitFor(() =>
				expect(db.botFollowUp.create).toHaveBeenCalled(),
			);
			const data = db.botFollowUp.create.mock.calls[0]?.[0]?.data;
			expect(data).toMatchObject({
				type: "post_escalation",
				channel: "bot",
				status: "scheduled",
				conversationId: "conv-1",
				taskId: "task-new",
			});
			expect(data.dueAt).toBeInstanceOf(Date);
			expect(data.dueAt.getTime()).toBeGreaterThan(Date.now());
		});

		it("moves the pending check-back instead of stacking a second", async () => {
			// 1st findFirst: the check-back-linked task lookup; 2nd: pending row.
			db.botFollowUp.findFirst
				.mockResolvedValueOnce(null)
				.mockResolvedValueOnce({ id: "fu-1" });
			await run("call_1");
			await vi.waitFor(() =>
				expect(db.botFollowUp.update).toHaveBeenCalled(),
			);
			expect(db.botFollowUp.create).not.toHaveBeenCalled();
			expect(db.botFollowUp.update.mock.calls[0]?.[0]).toMatchObject({
				where: { id: "fu-1" },
				data: { taskId: "task-new" },
			});
		});

		it("does not schedule when the check-back is off", async () => {
			db.aiAgent.findUnique.mockResolvedValue({
				organizationId: "org-1",
				postEscalationCheckMinutes: null,
				followUpWindowStart: "09:00",
				followUpWindowEnd: "20:30",
			});
			await run("call_1");
			await vi.waitFor(() => expect(db.task.create).toHaveBeenCalled());
			expect(db.botFollowUp.create).not.toHaveBeenCalled();
		});

		it("updates the task the customer just answered a check-back about", async () => {
			db.botFollowUp.findFirst.mockResolvedValueOnce({
				taskId: "task-old",
			});
			await run("call_1");
			await vi.waitFor(() => expect(db.task.update).toHaveBeenCalled());
			expect(db.task.update.mock.calls[0]?.[0]?.where).toEqual({
				id: "task-old",
			});
			expect(db.task.create).not.toHaveBeenCalled();
			// The 1-hour rule is not consulted when a check-back task exists.
			expect(db.task.findFirst).toHaveBeenCalledTimes(1);
		});
	});
});
