import { describe, expect, it, vi } from "vitest";

const { mockLoggerInfo } = vi.hoisted(() => ({ mockLoggerInfo: vi.fn() }));
vi.mock("@repo/logs", () => ({
	logger: { info: mockLoggerInfo, warn: vi.fn(), error: vi.fn() },
}));

import { buildAgentMessages } from "./agent-context";
import type { DbMessageRow } from "./history";

const systemOptions = {
	basePrompt: "You are a support agent.",
	enabledTools: [],
};

function textOf(m: { content: unknown }): string {
	return typeof m.content === "string"
		? m.content
		: JSON.stringify(m.content);
}

function nonSystem(messages: ReturnType<typeof buildAgentMessages>) {
	return messages.filter((m) => m.role !== "system");
}

const DAY = 24 * 60 * 60_000;

describe("buildAgentMessages – history gap handling", () => {
	it("drops an exchange older than a week and inserts the fresh-request notice first", () => {
		const now = Date.now();
		const rows: DbMessageRow[] = [
			{
				role: "user",
				content: "[Image: Whish receipt 40 USD]",
				createdAt: new Date(now - 69 * DAY),
			},
			{
				role: "user",
				content: "paid for July",
				createdAt: new Date(now - 69 * DAY + 60_000),
			},
			{
				role: "user",
				content: "we put money for this month",
				createdAt: new Date(now - 60_000),
			},
		];
		const out = nonSystem(
			buildAgentMessages({
				systemOptions,
				history: rows,
				contextGapThresholdMinutes: 240,
			}),
		);
		expect(out).toHaveLength(2);
		expect(textOf(out[0] as never)).toContain("are not shown");
		expect(textOf(out[0] as never)).toContain("68 days");
		expect(textOf(out[1] as never)).toBe("we put money for this month");
		expect(out.map((m) => textOf(m as never)).join(" ")).not.toContain(
			"Whish receipt",
		);
	});

	it("keeps a recent earlier exchange but places the notice at the real pause, not before unanswered user rows", () => {
		const now = Date.now();
		const rows: DbMessageRow[] = [
			{
				role: "assistant",
				content: "how can I help?",
				createdAt: new Date(now - 2 * DAY),
			},
			{
				role: "user",
				content: "[Image: receipt]",
				createdAt: new Date(now - 2 * DAY + 60_000),
			},
			{
				role: "user",
				content: "paid",
				createdAt: new Date(now - 2 * DAY + 120_000),
			},
			{
				role: "user",
				content: "hello again",
				createdAt: new Date(now - 60_000),
			},
		];
		const out = nonSystem(
			buildAgentMessages({
				systemOptions,
				history: rows,
				contextGapThresholdMinutes: 240,
			}),
		);
		expect(out.map((m) => textOf(m as never))).toEqual([
			"how can I help?",
			"[Image: receipt]",
			"paid",
			expect.stringContaining("earlier exchange that ended on"),
			"hello again",
		]);
	});

	it("adds no notice when the pause is below the threshold", () => {
		const now = Date.now();
		const rows: DbMessageRow[] = [
			{
				role: "assistant",
				content: "ok",
				createdAt: new Date(now - 30 * 60_000),
			},
			{
				role: "user",
				content: "thanks",
				createdAt: new Date(now - 60_000),
			},
		];
		const out = nonSystem(
			buildAgentMessages({
				systemOptions,
				history: rows,
				contextGapThresholdMinutes: 240,
			}),
		);
		expect(out.map((m) => textOf(m as never))).toEqual(["ok", "thanks"]);
	});

	it("falls back to the conversation timestamp when rows carry no createdAt", () => {
		const rows: DbMessageRow[] = [
			{ role: "assistant", content: "ok" },
			{ role: "user", content: "back again" },
		];
		const out = nonSystem(
			buildAgentMessages({
				systemOptions,
				history: rows,
				lastMessageAt: new Date(Date.now() - 5 * 60 * 60_000),
				contextGapThresholdMinutes: 240,
			}),
		);
		expect(out.map((m) => textOf(m as never))).toEqual([
			"ok",
			expect.stringContaining("[Context Notice:"),
			"back again",
		]);
	});

	it("cuts at the most recent week-long gap even when the newest pause is short, and reads the reply against the teammate's message", () => {
		// Prod conversation, 2026-09-14: a 36-day and a 10-day silence, then
		// Jhonny's voice note and the customer's answer 5h14m later. The bot
		// used to see the August "$35 from Ziad Hamzo" exchange and ask about it.
		const at = (iso: string) => new Date(iso);
		const rows: DbMessageRow[] = [
			{
				role: "user",
				content: "hello",
				createdAt: at("2026-07-03T07:00:00Z"),
			},
			{
				role: "user",
				content: "ziad hamzo sent you 35$",
				createdAt: at("2026-08-08T07:00:00Z"),
			},
			{
				role: "assistant",
				content:
					"Thanks, I've passed the $35 transfer from Hamzo to the team.",
				createdAt: at("2026-08-08T07:01:00Z"),
			},
			{
				role: "user",
				content: "internet slow",
				createdAt: at("2026-09-04T08:00:00Z"),
			},
			{
				role: "assistant",
				content: "Let me check.",
				createdAt: at("2026-09-04T08:01:00Z"),
			},
			{
				role: "admin",
				content:
					"Is the money ready? Transfer it or leave it with the guard.",
				attachmentType: "audio",
				createdAt: at("2026-09-14T09:39:00Z"),
			},
			{
				role: "user",
				content: "yes I'll leave it with the guard tomorrow",
				createdAt: at("2026-09-14T14:53:00Z"),
			},
		];
		mockLoggerInfo.mockClear();
		const out = nonSystem(
			buildAgentMessages({
				conversationId: "conv-elias",
				systemOptions,
				history: rows,
				contextGapThresholdMinutes: 240,
				now: at("2026-09-14T14:54:00Z"),
			}),
		);
		const texts = out.map((m) => textOf(m as never));
		const all = texts.join(" ").toLowerCase();
		expect(all).not.toContain("35$");
		expect(all).not.toContain("$35");
		expect(all).not.toContain("hamzo");
		expect(all).not.toContain("internet slow");
		expect(texts).toEqual([
			expect.stringContaining(
				"Older messages in this chat are not shown",
			),
			expect.stringContaining("Is the money ready?"),
			expect.stringContaining(
				"from a human teammate (sent 2026-09-14 12:39",
			),
			"yes I'll leave it with the guard tomorrow",
		]);
		expect(texts[0]).toContain("2026-09-04");
		expect(texts[2]).toContain("5 hours");
		expect(texts[2]).not.toContain("Everything above this notice");
		expect(mockLoggerInfo).toHaveBeenCalledWith("ai-history-window", {
			conversationId: "conv-elias",
			loaded: 7,
			kept: 2,
			droppedStale: 5,
			droppedAge: 0,
			pauseNote: true,
			teammateNote: true,
		});
	});

	it("uses the standard pause notice when the row before the pause is not a teammate's", () => {
		const now = Date.now();
		const rows: DbMessageRow[] = [
			{
				role: "user",
				content: "old topic",
				createdAt: new Date(now - 10 * DAY),
			},
			{
				role: "assistant",
				content: "noted",
				createdAt: new Date(now - 2 * DAY),
			},
			{
				role: "user",
				content: "hello",
				createdAt: new Date(now - 60_000),
			},
		];
		const out = nonSystem(
			buildAgentMessages({
				systemOptions,
				history: rows,
				contextGapThresholdMinutes: 240,
			}),
		);
		expect(out.map((m) => textOf(m as never))).toEqual([
			expect.stringContaining("are not shown"),
			"noted",
			expect.stringContaining("Everything above this notice"),
			"hello",
		]);
	});

	it("drops rows two weeks old even when the chat never paused a full week", () => {
		const now = Date.now();
		const rows: DbMessageRow[] = [];
		for (let daysAgo = 20; daysAgo >= 2; daysAgo -= 3) {
			rows.push({
				role: "user",
				content: `message from ${daysAgo} days ago`,
				createdAt: new Date(now - daysAgo * DAY),
			});
		}
		rows.push({
			role: "user",
			content: "today",
			createdAt: new Date(now - 60_000),
		});
		const out = nonSystem(
			buildAgentMessages({
				systemOptions,
				history: rows,
				contextGapThresholdMinutes: 240,
			}),
		);
		const texts = out.map((m) => textOf(m as never));
		expect(texts[0]).toContain("are not shown");
		expect(texts.join(" ")).not.toContain("20 days ago");
		expect(texts.join(" ")).not.toContain("17 days ago");
		expect(texts.join(" ")).not.toContain("14 days ago");
		expect(texts.join(" ")).toContain("11 days ago");
		expect(texts[texts.length - 1]).toBe("today");
	});

	it("keeps the dropped-history notice for a follow-up whose whole history is stale", () => {
		const now = Date.now();
		const rows: DbMessageRow[] = [
			{
				role: "assistant",
				content: "Your receipt was received.",
				createdAt: new Date(now - 9 * DAY),
			},
		];
		const out = nonSystem(
			buildAgentMessages({
				systemOptions,
				history: rows,
				contextGapThresholdMinutes: 240,
				newUserMessage: "[Follow-up check]",
			}),
		);
		expect(out.map((m) => textOf(m as never))).toEqual([
			expect.stringContaining("are not shown"),
			"[Follow-up check]",
		]);
	});

	it("cuts at a gap of exactly seven days", () => {
		const now = Date.now();
		const rows: DbMessageRow[] = [
			{
				role: "user",
				content: "before",
				createdAt: new Date(now - 7 * DAY - 60_000),
			},
			{
				role: "user",
				content: "after",
				createdAt: new Date(now - 60_000),
			},
		];
		const out = nonSystem(
			buildAgentMessages({
				systemOptions,
				history: rows,
				contextGapThresholdMinutes: 240,
			}),
		);
		expect(out.map((m) => textOf(m as never))).toEqual([
			expect.stringContaining("are not shown"),
			"after",
		]);
	});
});
