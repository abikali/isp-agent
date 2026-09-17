import { describe, expect, it } from "vitest";
import type { DbMessageRow } from "../../history";
import {
	buildConversationExcerpt,
	buildEscalationMessage,
	type EscalationMessageInput,
	escalationSourceFromToolCallId,
} from "../lib/escalation-message";

// 09:30 Beirut (UTC+3).
const NOW = new Date("2026-09-14T06:30:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

function row(
	role: string,
	content: string,
	createdAt: Date,
	extra: Partial<DbMessageRow> = {},
): DbMessageRow {
	return { role, content, createdAt, ...extra };
}

describe("escalationSourceFromToolCallId", () => {
	it("maps the caller prefixes", () => {
		expect(escalationSourceFromToolCallId("unknown-c1")).toBe(
			"unknown-contact",
		);
		expect(escalationSourceFromToolCallId("guard-c1")).toBe("safety-net");
		expect(escalationSourceFromToolCallId("call_abc")).toBe("bot");
		expect(escalationSourceFromToolCallId(undefined)).toBe("bot");
	});
});

describe("buildConversationExcerpt", () => {
	it("labels customer, bot and team with Beirut times and media tags", () => {
		const excerpt = buildConversationExcerpt(
			[
				row("admin", "Voice note", minutesAgo(30), {
					attachmentType: "audio",
				}),
				row("user", "النت مقطوع", minutesAgo(10), {
					attachmentType: "voice",
				}),
				row("assistant", "Let me check", minutesAgo(9)),
			],
			NOW,
		);
		expect(excerpt.split("\n")).toEqual([
			"🧑‍💼 Team 09:00: [voice]",
			"👤 Customer 09:20: [voice] النت مقطوع",
			"🤖 Bot 09:21: Let me check",
		]);
	});

	it("keeps the newest messages when the budget runs out", () => {
		const rows = Array.from({ length: 6 }, (_, i) =>
			row(
				"user",
				`message number ${i} ${"x".repeat(120)}`,
				minutesAgo(60 - i),
			),
		);
		const excerpt = buildConversationExcerpt(rows, NOW, 300);
		expect(excerpt).toContain("message number 5");
		expect(excerpt).not.toContain("message number 0");
		const lines = excerpt.split("\n");
		expect(lines[lines.length - 1]).toContain("message number 5");
	});

	it("marks a silence of a day or more and dates older messages", () => {
		const excerpt = buildConversationExcerpt(
			[
				row("user", "is the money ready", minutesAgo(3 * 24 * 60 + 5)),
				row("user", "yes it is", minutesAgo(1)),
			],
			NOW,
		);
		expect(excerpt.split("\n")).toEqual([
			"👤 Customer 11/09 09:25: is the money ready",
			"— 3 days earlier —",
			"👤 Customer 09:29: yes it is",
		]);
	});

	it("drops provider placeholders", () => {
		expect(
			buildConversationExcerpt(
				[row("user", "[Sticker received]", minutesAgo(1))],
				NOW,
			),
		).toBe("");
	});
});

function input(
	overrides: Partial<EscalationMessageInput> = {},
): EscalationMessageInput {
	return {
		priority: "medium",
		category: "general",
		reason: "Unknown contact",
		source: "unknown-contact",
		displayName: "Joseph",
		customer: null,
		customerMatch: null,
		ispCustomer: null,
		customerUsername: undefined,
		contactPhone: "96170000000",
		summary: "Summary <b>here</b>",
		actionRequired: "Call them",
		rows: [
			row("user", "hello I want to subscribe", minutesAgo(20)),
			row("assistant", "Welcome", minutesAgo(19)),
			row("user", "Dekwaneh", minutesAgo(2)),
		],
		conversationId: "conv-1",
		conversationUrl:
			"https://cp.example.com/app/libancom/conversations/conv-1",
		now: NOW,
		...overrides,
	};
}

describe("buildEscalationMessage", () => {
	it("states why, who raised it, recency and links the conversation", () => {
		const message = buildEscalationMessage(input());
		expect(message).toContain("🟡 <b>MEDIUM</b> — General");
		expect(message).toContain(
			"❓ <b>Why:</b> Unknown contact · <i>unknown-contact rule</i>",
		);
		expect(message).toContain("<i>(not identified)</i>");
		expect(message).toContain("🕒 Last customer message: 2 min ago");
		expect(message).toContain("Summary &lt;b&gt;here&lt;/b&gt;");
		expect(message).toContain(
			'🔗 <a href="https://cp.example.com/app/libancom/conversations/conv-1">Open conversation</a>',
		);
		expect(message).not.toContain("<code>conv-1</code>");
	});

	it("flags an unverified phone match with the local status", () => {
		const message = buildEscalationMessage(
			input({
				customer: {
					fullName: "Joseph Helo",
					phone: "+96170000000",
					email: null,
					username: "joehelohome",
					address: null,
					accountNumber: "75172",
					status: "PENDING",
					planName: "Home 10",
					stationName: null,
				},
				customerMatch: "phone",
			}),
		);
		expect(message).toContain(
			"👤 Joseph · <code>joehelohome</code> <i>(phone match, not verified · local PENDING)</i>",
		);
		expect(message).toContain("📋 Home 10 · PENDING");
	});

	it("falls back to the raw id without a link", () => {
		const message = buildEscalationMessage(
			input({ conversationUrl: null }),
		);
		expect(message).toContain("<code>conv-1</code>");
	});
});
