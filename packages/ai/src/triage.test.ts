import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TriageDecision } from "./triage";
import { triageBufferedMessages } from "./triage";

// Mock classifyText — the unit under test is the triage logic,
// not the LLM call itself.
const mockClassifyText = vi.fn();
vi.mock("./classify", () => ({
	classifyText: (...args: unknown[]) => mockClassifyText(...args),
}));

// Mock @repo/logs to suppress output
vi.mock("@repo/logs", () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

function mockTriageDecision(decision: TriageDecision, message?: string) {
	mockClassifyText.mockResolvedValue({ decision, message });
}

const baseInput = {
	lastAssistantResponse: "Your internet plan is 50 Mbps and active.",
	recentUserMessage: "What is my internet speed?",
};

beforeEach(() => {
	mockClassifyText.mockReset();
});

describe("triageBufferedMessages", () => {
	// -----------------------------------------------------------------------
	// Skip decisions
	// -----------------------------------------------------------------------

	it("returns skip for impatient pings", async () => {
		mockTriageDecision("skip");

		const result = await triageBufferedMessages({
			...baseInput,
			bufferedMessages: ["???", "hello?"],
		});

		expect(result.decision).toBe("skip");
	});

	it("returns skip for dot-only messages", async () => {
		mockTriageDecision("skip");

		const result = await triageBufferedMessages({
			...baseInput,
			bufferedMessages: ["...", "."],
		});

		expect(result.decision).toBe("skip");
	});

	it("returns skip for duplicate of original question", async () => {
		mockTriageDecision("skip");

		const result = await triageBufferedMessages({
			...baseInput,
			bufferedMessages: ["What is my internet speed?"],
		});

		expect(result.decision).toBe("skip");
	});

	it("returns skip for Arabic impatient pings", async () => {
		mockTriageDecision("skip");

		const result = await triageBufferedMessages({
			...baseInput,
			bufferedMessages: ["هلو؟", "الو"],
		});

		expect(result.decision).toBe("skip");
	});

	it("returns skip for French impatient pings", async () => {
		mockTriageDecision("skip");

		const result = await triageBufferedMessages({
			...baseInput,
			bufferedMessages: ["allô?"],
		});

		expect(result.decision).toBe("skip");
	});

	// -----------------------------------------------------------------------
	// Acknowledge decisions
	// -----------------------------------------------------------------------

	it("returns acknowledge for English cancellation", async () => {
		mockTriageDecision(
			"acknowledge",
			"Understood, let me know if you need anything else.",
		);

		const result = await triageBufferedMessages({
			...baseInput,
			bufferedMessages: ["never mind"],
		});

		expect(result.decision).toBe("acknowledge");
		expect(result.message).toBeDefined();
		expect(result.message).toContain("let me know");
	});

	it("returns acknowledge for Arabic cancellation", async () => {
		mockTriageDecision("acknowledge", "تمام، أنا هون إذا بتحتاج شي.");

		const result = await triageBufferedMessages({
			...baseInput,
			bufferedMessages: ["خلص ما بدي"],
		});

		expect(result.decision).toBe("acknowledge");
		expect(result.message).toBeDefined();
	});

	it("returns acknowledge for French cancellation", async () => {
		mockTriageDecision(
			"acknowledge",
			"D'accord, n'hésitez pas si vous avez besoin d'aide.",
		);

		const result = await triageBufferedMessages({
			...baseInput,
			bufferedMessages: ["laisse tomber"],
		});

		expect(result.decision).toBe("acknowledge");
		expect(result.message).toBeDefined();
	});

	// -----------------------------------------------------------------------
	// Respond decisions
	// -----------------------------------------------------------------------

	it("returns respond for genuinely new question", async () => {
		mockTriageDecision("respond");

		const result = await triageBufferedMessages({
			...baseInput,
			bufferedMessages: [
				"Actually, can you also check my bandwidth usage?",
			],
		});

		expect(result.decision).toBe("respond");
	});

	it("returns respond for additional info", async () => {
		mockTriageDecision("respond");

		const result = await triageBufferedMessages({
			...baseInput,
			bufferedMessages: ["My username is ahmad123 by the way"],
		});

		expect(result.decision).toBe("respond");
	});

	// -----------------------------------------------------------------------
	// LLM failure fallback
	// -----------------------------------------------------------------------

	it("defaults to respond when classifyText returns null", async () => {
		mockClassifyText.mockResolvedValue(null);

		const result = await triageBufferedMessages({
			...baseInput,
			bufferedMessages: ["???"],
		});

		// Should never silently drop messages on failure
		expect(result.decision).toBe("respond");
	});

	// -----------------------------------------------------------------------
	// Edge cases
	// -----------------------------------------------------------------------

	it("handles single buffered message", async () => {
		mockTriageDecision("skip");

		const result = await triageBufferedMessages({
			...baseInput,
			bufferedMessages: ["?"],
		});

		expect(result.decision).toBe("skip");
	});

	it("handles many buffered messages", async () => {
		mockTriageDecision("skip");

		const result = await triageBufferedMessages({
			...baseInput,
			bufferedMessages: ["?", "hello?", "...", "!!", "are you there?"],
		});

		expect(result.decision).toBe("skip");
	});

	it("passes context to classifyText", async () => {
		mockTriageDecision("respond");

		await triageBufferedMessages({
			lastAssistantResponse: "Your account is active.",
			recentUserMessage: "Check my account",
			bufferedMessages: ["also check my speed"],
		});

		expect(mockClassifyText).toHaveBeenCalledOnce();
		const callArgs = mockClassifyText.mock.calls[0]?.[0] as Record<
			string,
			unknown
		>;
		const userPrompt = callArgs["userPrompt"] as string;
		expect(userPrompt).toContain("Check my account");
		expect(userPrompt).toContain("Your account is active.");
		expect(userPrompt).toContain("also check my speed");
	});

	it("does not include message field for skip decisions", async () => {
		mockTriageDecision("skip");

		const result = await triageBufferedMessages({
			...baseInput,
			bufferedMessages: ["???"],
		});

		expect(result.decision).toBe("skip");
		expect(result.message).toBeUndefined();
	});
});
