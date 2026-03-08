import { describe, expect, it } from "vitest";
import {
	buildContextGapNote,
	formatHistoryMessage,
	stripToolAnnotation,
} from "./history";

// ---------------------------------------------------------------------------
// Helper: replicates the exact injection logic used in all 4 handlers
// (webhook-handlers.ts, web-chat-handler.ts, web-chat-stream-handler.ts,
//  ai-chat.worker.ts)
// ---------------------------------------------------------------------------
function injectGapNote(
	historyMessages: Array<{ role: "user" | "assistant"; content: string }>,
	previousLastMessageAt: Date | null,
	contextGapThresholdMinutes: number,
): void {
	const gapNote = buildContextGapNote(
		previousLastMessageAt,
		contextGapThresholdMinutes,
	);
	if (gapNote && historyMessages.length > 0) {
		let insertIdx = historyMessages.length - 1;
		while (
			insertIdx > 0 &&
			historyMessages[insertIdx - 1]?.role === "user"
		) {
			insertIdx--;
		}
		historyMessages.splice(insertIdx, 0, {
			role: "user",
			content: gapNote,
		});
	}
}

// ---------------------------------------------------------------------------
// Unit tests for buildContextGapNote
// ---------------------------------------------------------------------------
describe("buildContextGapNote", () => {
	it("returns null when lastMessageAt is null", () => {
		expect(buildContextGapNote(null, 240)).toBeNull();
	});

	it("returns null when gap is below threshold", () => {
		const tenMinutesAgo = new Date(Date.now() - 10 * 60_000);
		expect(buildContextGapNote(tenMinutesAgo, 240)).toBeNull();
	});

	it("returns null when gap is just under threshold", () => {
		const justUnder = new Date(Date.now() - 239 * 60_000);
		expect(buildContextGapNote(justUnder, 240)).toBeNull();
	});

	it("returns a context notice when gap exceeds threshold", () => {
		const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60_000);
		const result = buildContextGapNote(fiveHoursAgo, 240);
		expect(result).not.toBeNull();
		expect(result).toContain("[Context Notice:");
		expect(result).toContain("5 hours");
		expect(result).toContain("Do not assume continuity");
	});

	it("formats single hour without plural", () => {
		const result = buildContextGapNote(
			new Date(Date.now() - 65 * 60_000),
			60,
		);
		expect(result).toContain("1 hour");
		expect(result).not.toContain("1 hours");
	});

	it("formats multiple hours", () => {
		const result = buildContextGapNote(
			new Date(Date.now() - 6 * 60 * 60_000),
			60,
		);
		expect(result).toContain("6 hours");
	});

	it("formats days without remaining hours", () => {
		const result = buildContextGapNote(
			new Date(Date.now() - 48 * 60 * 60_000),
			240,
		);
		expect(result).toContain("2 days");
	});

	it("formats days and hours together", () => {
		const result = buildContextGapNote(
			new Date(Date.now() - 27 * 60 * 60_000),
			240,
		);
		expect(result).toContain("1 day and 3 hours");
	});

	it("formats single day without plural", () => {
		const result = buildContextGapNote(
			new Date(Date.now() - 24 * 60 * 60_000),
			240,
		);
		expect(result).toContain("1 day");
		expect(result).not.toContain("1 days");
	});
});

// ---------------------------------------------------------------------------
// Unit tests for formatHistoryMessage
// ---------------------------------------------------------------------------
describe("formatHistoryMessage", () => {
	it("maps user role correctly", () => {
		expect(
			formatHistoryMessage({ role: "user", content: "Hello" }),
		).toEqual({ role: "user", content: "Hello" });
	});

	it("maps admin role to assistant", () => {
		expect(
			formatHistoryMessage({ role: "admin", content: "Admin reply" }),
		).toEqual({ role: "assistant", content: "Admin reply" });
	});

	it("appends tool call annotations for assistant messages", () => {
		const result = formatHistoryMessage({
			role: "assistant",
			content: "I looked that up.",
			toolCalls: [
				{
					toolName: "isp-search-customer",
					args: { query: "john" },
					result: "found",
				},
			],
		});
		expect(result.content).toContain("[Tools used in this response]");
		expect(result.content).toContain("isp-search-customer");
	});

	it("does not add annotations for user messages with toolCalls", () => {
		const result = formatHistoryMessage({
			role: "user",
			content: "test",
			toolCalls: [{ toolName: "something" }],
		});
		expect(result.content).toBe("test");
	});
});

// ---------------------------------------------------------------------------
// Real scenario smoke tests
// Simulate production data flow: DB rows → formatHistoryMessage → inject gap
// ---------------------------------------------------------------------------
describe("real scenario: customer returns after hours", () => {
	// Simulate DB rows exactly as Prisma returns them (role, content, toolCalls)
	const dbRows = [
		{ role: "user", content: "My internet is slow" },
		{
			role: "assistant",
			content: "Let me check your account.",
			toolCalls: [
				{
					toolName: "isp-search-customer",
					args: { phone: "96171123456" },
					result: { active: true, online: true, fupMode: "1" },
				},
			],
		},
		{
			role: "assistant",
			content:
				"Your account is in FUP mode — your daily quota was exceeded, which throttles speed. It resets at midnight.",
		},
		{ role: "user", content: "ok thanks" },
		{
			role: "assistant",
			content: "You're welcome! Let me know if you need anything else.",
		},
	];

	it("injects gap note when customer messages 8 hours later", () => {
		// Step 1: format DB rows (exactly what handlers do)
		const historyMessages = dbRows.map(formatHistoryMessage);

		// Step 2: customer sends a new message (gets appended to history by DB query)
		historyMessages.push({
			role: "user",
			content: "My internet is down now, nothing works",
		});

		// Step 3: inject gap note (previousLastMessageAt = 8 hours ago)
		const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60_000);
		injectGapNote(historyMessages, eightHoursAgo, 240);

		// Verify: gap note is right before the new user message
		expect(historyMessages).toHaveLength(7); // 5 original + gap note + new msg
		const gapIdx = historyMessages.findIndex((m) =>
			m.content.includes("[Context Notice:"),
		);
		expect(gapIdx).toBe(5); // after last assistant msg
		expect(historyMessages[gapIdx]?.content).toContain("8 hours");
		expect(historyMessages[gapIdx + 1]?.content).toBe(
			"My internet is down now, nothing works",
		);

		// The model should also still see tool history from the previous session
		expect(historyMessages[1]?.content).toContain(
			"[Tools used in this response]",
		);
		expect(historyMessages[1]?.content).toContain("isp-search-customer");
	});

	it("does NOT inject gap note when customer messages 30 minutes later", () => {
		const historyMessages = dbRows.map(formatHistoryMessage);
		historyMessages.push({
			role: "user",
			content: "Actually one more question",
		});

		const thirtyMinutesAgo = new Date(Date.now() - 30 * 60_000);
		injectGapNote(historyMessages, thirtyMinutesAgo, 240);

		// No gap note — same number of messages
		expect(historyMessages).toHaveLength(6);
		expect(
			historyMessages.some((m) => m.content.includes("[Context Notice:")),
		).toBe(false);
	});

	it("handles first-ever message (no previous conversation)", () => {
		const historyMessages = [{ role: "user" as const, content: "Hello" }];

		// previousLastMessageAt is null for a brand new conversation
		injectGapNote(historyMessages, null, 240);

		expect(historyMessages).toHaveLength(1);
		expect(historyMessages[0]?.content).toBe("Hello");
	});
});

describe("real scenario: customer sends rapid-fire messages after a gap", () => {
	it("gap note appears before all rapid-fire user messages", () => {
		// Previous conversation ended with assistant reply
		const historyMessages: Array<{
			role: "user" | "assistant";
			content: string;
		}> = [
			{ role: "user", content: "Can you check my account?" },
			{ role: "assistant", content: "Your account looks fine." },
			// Customer returns 2 days later and sends 3 quick messages
			{ role: "user", content: "Hey" },
			{ role: "user", content: "My internet stopped working" },
			{ role: "user", content: "Please help ASAP" },
		];

		const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60_000);
		injectGapNote(historyMessages, twoDaysAgo, 240);

		expect(historyMessages).toHaveLength(6);

		// Gap note should be at index 2 (after assistant, before rapid-fire user msgs)
		expect(historyMessages[2]?.content).toContain("[Context Notice:");
		expect(historyMessages[2]?.content).toContain("2 days");
		expect(historyMessages[3]?.content).toBe("Hey");
		expect(historyMessages[4]?.content).toBe("My internet stopped working");
		expect(historyMessages[5]?.content).toBe("Please help ASAP");
	});
});

describe("real scenario: web chat session resumed next day", () => {
	it("gap note injected in web chat just like webhook handlers", () => {
		// Web chat conversation from yesterday
		const historyMessages: Array<{
			role: "user" | "assistant";
			content: string;
		}> = [
			{ role: "user", content: "What plans do you offer?" },
			{
				role: "assistant",
				content:
					"We have Basic (10 Mbps), Standard (25 Mbps), and Premium (50 Mbps).",
			},
			{ role: "user", content: "How much is Premium?" },
			{
				role: "assistant",
				content: "Premium is $49.99/month.",
			},
			// Customer comes back 18 hours later
			{ role: "user", content: "I want to sign up" },
		];

		const eighteenHoursAgo = new Date(Date.now() - 18 * 60 * 60_000);
		injectGapNote(historyMessages, eighteenHoursAgo, 240);

		expect(historyMessages).toHaveLength(6);
		const gapMsg = historyMessages[4];
		expect(gapMsg?.content).toContain("[Context Notice:");
		expect(gapMsg?.content).toContain("18 hours");

		// The actual user message follows the gap note
		expect(historyMessages[5]?.content).toBe("I want to sign up");

		// Previous context is preserved intact
		expect(historyMessages[0]?.content).toBe("What plans do you offer?");
		expect(historyMessages[3]?.content).toContain("$49.99");
	});
});

describe("real scenario: custom threshold (1 hour for urgent support)", () => {
	it("triggers gap note after just over 1 hour with 60-min threshold", () => {
		const historyMessages: Array<{
			role: "user" | "assistant";
			content: string;
		}> = [
			{ role: "user", content: "Router keeps rebooting" },
			{
				role: "assistant",
				content: "Try unplugging it for 30 seconds.",
			},
			{ role: "user", content: "Still happening" },
		];

		const seventyMinutesAgo = new Date(Date.now() - 70 * 60_000);
		injectGapNote(historyMessages, seventyMinutesAgo, 60);

		expect(historyMessages).toHaveLength(4);
		expect(historyMessages[2]?.content).toContain("[Context Notice:");
		expect(historyMessages[2]?.content).toContain("1 hour");
		expect(historyMessages[3]?.content).toBe("Still happening");
	});

	it("does NOT trigger at 45 minutes with 60-min threshold", () => {
		const historyMessages: Array<{
			role: "user" | "assistant";
			content: string;
		}> = [
			{ role: "user", content: "Router keeps rebooting" },
			{
				role: "assistant",
				content: "Try unplugging it for 30 seconds.",
			},
			{ role: "user", content: "Still happening" },
		];

		const fortyFiveMinutesAgo = new Date(Date.now() - 45 * 60_000);
		injectGapNote(historyMessages, fortyFiveMinutesAgo, 60);

		expect(historyMessages).toHaveLength(3);
	});
});

// ---------------------------------------------------------------------------
// Unit tests for stripToolAnnotation
// ---------------------------------------------------------------------------
describe("stripToolAnnotation", () => {
	it("strips tool annotation from model output", () => {
		const text =
			'Here is your answer.\n\n[Tools used in this response]\n- escalate-telegram: {"reason":"test"}';
		expect(stripToolAnnotation(text)).toBe("Here is your answer.");
	});

	it("strips annotation with multiple tools", () => {
		const text =
			'Checked your account.\n\n[Tools used in this response]\n- isp-search-customer: {"query":"123"}\n- isp-ping-customer: {"query":"123"}';
		expect(stripToolAnnotation(text)).toBe("Checked your account.");
	});

	it("returns text unchanged when no annotation present", () => {
		const text = "Just a normal response with no tools.";
		expect(stripToolAnnotation(text)).toBe(text);
	});

	it("returns empty string for annotation-only text", () => {
		const text =
			'[Tools used in this response]\n- escalate-telegram: {"reason":"test"}';
		expect(stripToolAnnotation(text)).toBe("");
	});

	it("handles Arabic text before annotation", () => {
		const text =
			'أهلاً بك! رح مرق طلبك للفريق.\n\n[Tools used in this response]\n- escalate-telegram: {"priority":"medium"}';
		expect(stripToolAnnotation(text)).toBe("أهلاً بك! رح مرق طلبك للفريق.");
	});

	it("does not strip text that merely contains the word 'tools'", () => {
		const text = "I used some tools to check your account.";
		expect(stripToolAnnotation(text)).toBe(text);
	});

	it("handles extra newlines before annotation", () => {
		const text =
			'Done.\n\n\n\n[Tools used in this response]\n- ping-host: {"host":"1.1.1.1"}';
		expect(stripToolAnnotation(text)).toBe("Done.");
	});
});

// ---------------------------------------------------------------------------
// Smoke test: full flow — model mimics annotation, strip before send
// ---------------------------------------------------------------------------
describe("real scenario: model mimics tool annotation in output", () => {
	it("stripToolAnnotation removes mimicked annotation before sending to customer", () => {
		// This is the exact scenario from production: Gemini saw the annotation
		// pattern in history and reproduced it in its own response text
		const modelOutput =
			"أهلاً بك! كرمال تشترك معنا، فيك تشوف كل الخطط والأسعار المتوفرة على موقعنا: https://libancom.abiroot.dev\n\n" +
			"أنا موجود هون كرمال ساعدك، بس الفريق المختص هو اللي بيتواصل معك ليخلص المعاملة.\n\n" +
			'[Tools used in this response]\n- escalate-telegram: {"actionRequired":"Contact customer","category":"installation","customerName":"Ayman","priority":"medium","reason":"New subscription inquiry","summary":"Customer Ayman wants to subscribe."}';

		const cleaned = stripToolAnnotation(modelOutput);

		// The annotation is gone
		expect(cleaned).not.toContain("[Tools used in this response]");
		expect(cleaned).not.toContain("escalate-telegram");

		// The actual customer-facing text is preserved
		expect(cleaned).toContain("أهلاً بك!");
		expect(cleaned).toContain("https://libancom.abiroot.dev");
		expect(cleaned).toContain("الفريق المختص");
	});

	it("formatHistoryMessage still adds annotation for history context", () => {
		// After stripping and saving, the DB has clean content + separate toolCalls
		const dbRow = {
			role: "assistant",
			content: "أهلاً بك! رح مرق طلبك للفريق.",
			toolCalls: [
				{
					toolName: "escalate-telegram",
					args: { reason: "New subscription" },
					result: { success: true },
				},
			],
		};

		// formatHistoryMessage should still append annotation for model context
		const historyMsg = formatHistoryMessage(dbRow);
		expect(historyMsg.content).toContain("[Tools used in this response]");
		expect(historyMsg.content).toContain("escalate-telegram");

		// But if we strip it, we get back the clean text
		const cleaned = stripToolAnnotation(historyMsg.content);
		expect(cleaned).toBe("أهلاً بك! رح مرق طلبك للفريق.");
	});
});
