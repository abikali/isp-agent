import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, summarize } = vi.hoisted(() => ({
	db: {
		task: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
		aiConversation: { findUnique: vi.fn() },
		aiMessage: { findMany: vi.fn() },
		customer: { findMany: vi.fn(), findUnique: vi.fn() },
		aiAgentToolConfig: { findFirst: vi.fn() },
		aiAgent: { findUnique: vi.fn() },
	},
	summarize: vi.fn(),
}));

vi.mock("@repo/database", () => ({ db }));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../../escalation-summary", () => ({
	summarizeForEscalation: summarize,
}));

import { escalateTelegram } from "../escalate-telegram";

const context = {
	organizationId: "org-1",
	agentId: "agent-1",
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
	db.task.create.mockResolvedValue({});
	db.aiAgent.findUnique.mockResolvedValue({ organizationId: "org-1" });
	db.aiConversation.findUnique.mockResolvedValue({
		contactId: "96170000000",
		contactName: "Joseph",
		verifiedCustomerId: null,
		agent: { organizationId: "org-1", organization: { slug: "libancom" } },
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
	summarize.mockResolvedValue({
		summary: "LLM summary",
		priority: "high",
		category: "repair",
		actionRequired: "Dispatch a technician",
	});
});

describe("escalate-telegram", () => {
	it("keeps the caller's priority and category over the summariser's", async () => {
		const out = await run("call_1");
		expect(out.success).toBe(true);
		expect(out.message).toContain("priority: medium");
		const text = sentText();
		expect(text).toContain("<b>MEDIUM</b> — Support");
		expect(text).not.toContain("URGENT");
		expect(text).toContain("LLM summary");
		expect(text).toContain("Dispatch a technician");
		expect(text).toContain("raised by the bot");
		expect(text).toContain(
			"https://cp.example.com/app/libancom/conversations/conv-1",
		);
		await vi.waitFor(() => expect(db.task.create).toHaveBeenCalled());
		const created = db.task.create.mock.calls[0]?.[0]?.data;
		expect(created.priority).toBe("MEDIUM");
		expect(created.category).toBe("SUPPORT");
	});

	it("does not run the summariser a second time for safety-net escalations", async () => {
		await run("guard-conv-1");
		expect(summarize).not.toHaveBeenCalled();
		const text = sentText();
		expect(text).toContain("Customer reports no internet.");
		expect(text).toContain("safety net");
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
});
