import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/database", () => ({
	db: {
		aiConversation: { findFirst: vi.fn(), update: vi.fn() },
		aiMessage: { findFirst: vi.fn() },
	},
}));
vi.mock("@repo/api/lib/permission", () => ({
	requirePermission: vi.fn().mockResolvedValue({}),
}));
vi.mock("@repo/jobs", () => ({
	cancelTeammateWait: vi.fn().mockResolvedValue(undefined),
	queueAiChatRetry: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { db } from "@repo/database";
import { cancelTeammateWait, queueAiChatRetry } from "@repo/jobs";
import { resumeConversation } from "../procedures/resume-conversation";

const mockDb = vi.mocked(db, true);

async function call() {
	return (
		resumeConversation as unknown as {
			"~orpc": { handler: (args: unknown) => Promise<unknown> };
		}
	)["~orpc"].handler({
		context: { user: { id: "user-1" } },
		input: { conversationId: "conv-1", organizationId: "org-1" },
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	mockDb.aiConversation.findFirst.mockResolvedValue({
		id: "conv-1",
		channelId: "channel-1",
		agent: { organizationId: "org-1" },
		channel: { id: "channel-1" },
	} as never);
	mockDb.aiConversation.update.mockResolvedValue({} as never);
});

describe("aiAgents.resumeConversation", () => {
	it("clears the takeover and the teammate wait", async () => {
		mockDb.aiMessage.findFirst.mockResolvedValue({
			role: "admin",
		} as never);

		await call();

		expect(mockDb.aiConversation.update).toHaveBeenCalledWith({
			where: { id: "conv-1" },
			data: { humanTakeoverAt: null, awaitingHumanSince: null },
		});
		expect(cancelTeammateWait).toHaveBeenCalledWith("conv-1");
		expect(queueAiChatRetry).not.toHaveBeenCalled();
	});

	it("forces a reply past the teammate deferral when the customer wrote last", async () => {
		mockDb.aiMessage.findFirst.mockResolvedValue({ role: "user" } as never);

		await call();

		expect(queueAiChatRetry).toHaveBeenCalledWith({
			conversationId: "conv-1",
			channelId: "channel-1",
			bypassDeferral: true,
		});
	});
});
