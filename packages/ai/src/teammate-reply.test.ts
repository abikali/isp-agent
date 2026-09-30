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
	complainsNoReply,
	isBarePing,
	shouldDeferToTeammate,
	type TeammateReplyRow,
	teammateActionNeeded,
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
			needsTeammateAction: false,
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
		).resolves.toEqual({ defer: true, needsAction: false });

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
			needsTeammateAction: true,
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

	it("skips the classifier when the teammate wrote more than 6h earlier", async () => {
		findFirst.mockResolvedValue(teammate);
		findMany.mockResolvedValue([
			row("user", "ok thanks", hoursAfter(6.02)),
		]);

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

const credentials = { provider: "openrouter", apiKey: "test" } as const;

describe("shouldDeferToTeammate — v2 window, overrides, needsAction", () => {
	it("classifies at 5h59 and replies without classifying at 6h01", async () => {
		findFirst.mockResolvedValue(teammate);
		classifyText.mockResolvedValue({
			addressedToTeammate: true,
			needsTeammateAction: false,
			reason: "ack",
		});

		findMany.mockResolvedValue([
			row("user", "ok merci", hoursAfter(5 + 59 / 60)),
		]);
		await expect(
			shouldDeferToTeammate({ credentials, conversationId: "conv-1" }),
		).resolves.toEqual({ defer: true, needsAction: false });
		expect(classifyText).toHaveBeenCalledTimes(1);

		findMany.mockResolvedValue([
			row("user", "ok merci", hoursAfter(6 + 1 / 60)),
		]);
		await expect(
			shouldDeferToTeammate({ credentials, conversationId: "conv-1" }),
		).resolves.toBe(false);
		expect(classifyText).toHaveBeenCalledTimes(1);
	});

	it("propagates needsTeammateAction", async () => {
		findFirst.mockResolvedValue(teammate);
		findMany.mockResolvedValue([
			row("user", "johnny please turn my internet on", hoursAfter(1)),
		]);
		classifyText.mockResolvedValue({
			addressedToTeammate: true,
			needsTeammateAction: true,
			reason: "asks the teammate to act",
		});

		await expect(
			shouldDeferToTeammate({ credentials, conversationId: "conv-1" }),
		).resolves.toEqual({ defer: true, needsAction: true });
	});

	it("does not defer, and skips the classifier, when the customer says nobody replied", async () => {
		findFirst.mockResolvedValue(teammate);
		findMany.mockResolvedValue([
			row("user", "leh ma radet 3a laye ?", hoursAfter(1.2)),
		]);

		await expect(
			shouldDeferToTeammate({ credentials, conversationId: "conv-1" }),
		).resolves.toBe(false);
		expect(classifyText).not.toHaveBeenCalled();
	});

	it("treats a bare ?? 73 min after the teammate as a ping", async () => {
		findFirst.mockResolvedValue(teammate);
		findMany.mockResolvedValue([
			row("user", "??", new Date(TEAMMATE_AT.getTime() + 73 * 60_000)),
		]);

		await expect(
			shouldDeferToTeammate({ credentials, conversationId: "conv-1" }),
		).resolves.toBe(false);
		expect(classifyText).not.toHaveBeenCalled();
	});

	it("leaves a ?? 3 min after the teammate to the classifier", async () => {
		findFirst.mockResolvedValue(teammate);
		findMany.mockResolvedValue([
			row("user", "??", new Date(TEAMMATE_AT.getTime() + 3 * 60_000)),
		]);
		classifyText.mockResolvedValue({
			addressedToTeammate: true,
			needsTeammateAction: false,
			reason: "reacting to the teammate",
		});

		await shouldDeferToTeammate({ credentials, conversationId: "conv-1" });
		expect(classifyText).toHaveBeenCalledTimes(1);
	});
});

describe("teammateActionNeeded", () => {
	it("is true when the classifier fails", async () => {
		findFirst.mockResolvedValue(teammate);
		findMany.mockResolvedValue([row("user", "ok", hoursAfter(0.2))]);
		classifyText.mockResolvedValue(null);

		await expect(
			teammateActionNeeded({ credentials, conversationId: "conv-1" }),
		).resolves.toBe(true);
	});

	it("is false for a pure acknowledgement", async () => {
		findFirst.mockResolvedValue(teammate);
		findMany.mockResolvedValue([row("user", "👍", hoursAfter(0.2))]);
		classifyText.mockResolvedValue({
			addressedToTeammate: true,
			needsTeammateAction: false,
			reason: "thumbs up",
		});

		await expect(
			teammateActionNeeded({ credentials, conversationId: "conv-1" }),
		).resolves.toBe(false);
	});
});

describe("complainsNoReply", () => {
	it.each([
		"leh ma radet 3a laye ?",
		"ليش ما رديت",
		"nobody answered me",
		"personne ne répond",
		"ma 7ada rad",
	])("matches %s", (text) => {
		expect(complainsNoReply(text)).toBe(true);
	});

	it("does not match a plain thank-you", () => {
		expect(complainsNoReply("ok merci")).toBe(false);
	});
});

describe("isBarePing", () => {
	it("needs only punctuation, at least 10 minutes after the teammate", () => {
		const at = (m: number) => new Date(TEAMMATE_AT.getTime() + m * 60_000);
		expect(isBarePing(teammate, [row("user", "??", at(73))])).toBe(true);
		expect(isBarePing(teammate, [row("user", "؟؟", at(15))])).toBe(true);
		expect(isBarePing(teammate, [row("user", "??", at(3))])).toBe(false);
		expect(isBarePing(teammate, [row("user", "shu??", at(73))])).toBe(
			false,
		);
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
