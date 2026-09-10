import { describe, expect, it } from "vitest";
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
		expect(textOf(out[0] as never)).toContain("is not shown");
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
});
