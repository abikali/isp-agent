import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirst, findMany, classifyText } = vi.hoisted(() => ({
	findFirst: vi.fn(),
	findMany: vi.fn(),
	classifyText: vi.fn(),
}));

vi.mock("@repo/database", () => ({
	db: { aiMessage: { findFirst, findMany } },
}));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("./classify", () => ({ classifyText }));

import {
	buildTeammateReplyPrompt,
	shouldDeferToTeammate,
	type TeammateReplyRow,
} from "./teammate-reply";

const TEAMMATE_AT = new Date("2026-09-14T06:00:00Z");
const hoursAfter = (h: number) =>
	new Date(TEAMMATE_AT.getTime() + h * 60 * 60_000);

function row(
	role: string,
	content: string,
	createdAt: Date,
	attachmentType: string | null = null,
): TeammateReplyRow {
	return { role, content, attachmentType, createdAt };
}

const teammate = row("admin", "jehzo masare please, plz whish", TEAMMATE_AT);

beforeEach(() => {
	vi.clearAllMocks();
});

describe("shouldDeferToTeammate", () => {
	it("defers when the classifier says the customer answers the teammate", async () => {
		findFirst.mockResolvedValue(teammate);
		// Loaded newest first.
		findMany.mockResolvedValue([
			row("user", "ba3tak bokra", hoursAfter(5)),
			row("user", "ok", hoursAfter(4.9)),
		]);
		classifyText.mockResolvedValue({
			addressedToTeammate: true,
			reason: "answers the payment request",
		});

		await expect(
			shouldDeferToTeammate({
				credentials: {
					provider: "openrouter",
					apiKey: "test",
				} as const,
				conversationId: "conv-1",
			}),
		).resolves.toBe(true);

		expect(findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					conversationId: "conv-1",
					role: "user",
					createdAt: { gt: TEAMMATE_AT },
				},
			}),
		);
		const prompt = classifyText.mock.calls[0]?.[0].userPrompt as string;
		expect(prompt).toContain("jehzo masare please");
		// Oldest first.
		expect(prompt.indexOf(") ok")).toBeLessThan(prompt.indexOf("ba3tak"));
	});

	it("replies when the classifier says the message needs the bot", async () => {
		findFirst.mockResolvedValue(teammate);
		findMany.mockResolvedValue([
			row("user", "internet 2ate3 men sob7", hoursAfter(3)),
		]);
		classifyText.mockResolvedValue({
			addressedToTeammate: false,
			reason: "new outage report",
		});

		await expect(
			shouldDeferToTeammate({
				credentials: {
					provider: "openrouter",
					apiKey: "test",
				} as const,
				conversationId: "conv-1",
			}),
		).resolves.toBe(false);
	});

	it("replies when the classifier fails", async () => {
		findFirst.mockResolvedValue(teammate);
		findMany.mockResolvedValue([row("user", "ok", hoursAfter(2))]);
		classifyText.mockResolvedValue(null);

		await expect(
			shouldDeferToTeammate({
				credentials: {
					provider: "openrouter",
					apiKey: "test",
				} as const,
				conversationId: "conv-1",
			}),
		).resolves.toBe(false);
	});

	it("does not gate when the bot spoke after the teammate", async () => {
		findFirst.mockResolvedValue(
			row("assistant", "How can I help?", hoursAfter(1)),
		);

		await expect(
			shouldDeferToTeammate({
				credentials: {
					provider: "openrouter",
					apiKey: "test",
				} as const,
				conversationId: "conv-1",
			}),
		).resolves.toBe(false);
		expect(findMany).not.toHaveBeenCalled();
		expect(classifyText).not.toHaveBeenCalled();
	});

	it("does not gate a chat where only the customer has written", async () => {
		findFirst.mockResolvedValue(null);

		await expect(
			shouldDeferToTeammate({
				credentials: {
					provider: "openrouter",
					apiKey: "test",
				} as const,
				conversationId: "conv-1",
			}),
		).resolves.toBe(false);
		expect(classifyText).not.toHaveBeenCalled();
	});

	it("skips the classifier when the teammate wrote more than 24h earlier", async () => {
		findFirst.mockResolvedValue(teammate);
		findMany.mockResolvedValue([row("user", "ok thanks", hoursAfter(25))]);

		await expect(
			shouldDeferToTeammate({
				credentials: {
					provider: "openrouter",
					apiKey: "test",
				} as const,
				conversationId: "conv-1",
			}),
		).resolves.toBe(false);
		expect(classifyText).not.toHaveBeenCalled();
	});

	it("skips the classifier when no customer message follows the teammate", async () => {
		findFirst.mockResolvedValue(teammate);
		findMany.mockResolvedValue([]);

		await expect(
			shouldDeferToTeammate({
				credentials: {
					provider: "openrouter",
					apiKey: "test",
				} as const,
				conversationId: "conv-1",
			}),
		).resolves.toBe(false);
		expect(classifyText).not.toHaveBeenCalled();
	});
});

describe("buildTeammateReplyPrompt", () => {
	it("marks media whose content is not visible and keeps transcripts", () => {
		const prompt = buildTeammateReplyPrompt(
			row("admin", "Voice note", TEAMMATE_AT, "audio"),
			[
				row("user", "[Voice message received]", hoursAfter(1), "audio"),
				row("user", "tamem ba3tak", hoursAfter(2), "audio"),
			],
		);
		expect(prompt).toContain("[audio, content not visible]");
		expect(prompt).toContain("[audio, transcribed] tamem ba3tak");
		// Beirut time (UTC+3 in September).
		expect(prompt).toContain("2026-09-14 09:00");
	});
});
