import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	detectMissedEscalation,
	executeEscalationGuard,
} from "./escalation-guard";

// Mock classifyText — the unit under test is the escalation guard logic,
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

function mockEscalation(promisedEscalation: boolean) {
	mockClassifyText.mockResolvedValue({ promisedEscalation });
}

function mockClassifyFailure() {
	mockClassifyText.mockResolvedValue(null);
}

beforeEach(() => {
	mockClassifyText.mockReset();
});

// ---------------------------------------------------------------------------
// detectMissedEscalation — basic behavior
// ---------------------------------------------------------------------------

describe("detectMissedEscalation", () => {
	it("returns false when escalate-telegram was already called", async () => {
		const result = await detectMissedEscalation(
			"I've forwarded your request to the team.",
			[
				{
					toolName: "escalate-telegram",
					args: { reason: "test" },
					result: { success: true },
				},
			],
		);
		expect(result).toBe(false);
		// Should not even call the LLM
		expect(mockClassifyText).not.toHaveBeenCalled();
	});

	it("returns false when text has no escalation phrases", async () => {
		mockEscalation(false);
		expect(
			await detectMissedEscalation("Your internet speed is 50 Mbps."),
		).toBe(false);

		mockEscalation(false);
		expect(
			await detectMissedEscalation(
				"I found your account. Everything looks good.",
			),
		).toBe(false);

		mockEscalation(false);
		expect(await detectMissedEscalation("مرحبا، كيف يمكنني مساعدتك؟")).toBe(
			false,
		);
	});

	it("returns false for empty text", async () => {
		expect(await detectMissedEscalation("")).toBe(false);
		// Should not call the LLM for empty text
		expect(mockClassifyText).not.toHaveBeenCalled();
	});

	it("returns false when other tools were called but not escalate-telegram", async () => {
		mockEscalation(false);
		const result = await detectMissedEscalation(
			"Your account status is active.",
			[
				{
					toolName: "isp-search-customer",
					args: {},
					result: { found: true },
				},
			],
		);
		expect(result).toBe(false);
	});

	it("returns false with undefined toolResults and no escalation text", async () => {
		mockEscalation(false);
		expect(await detectMissedEscalation("All good here.", undefined)).toBe(
			false,
		);
	});

	it("returns false with empty toolResults array and no escalation text", async () => {
		mockEscalation(false);
		expect(await detectMissedEscalation("All good here.", [])).toBe(false);
	});

	// -----------------------------------------------------------------------
	// English phrases
	// -----------------------------------------------------------------------

	it("detects 'forwarded your request'", async () => {
		mockEscalation(true);
		expect(
			await detectMissedEscalation(
				"I've forwarded your request to the support team.",
			),
		).toBe(true);
	});

	it("detects 'forwarding the details'", async () => {
		mockEscalation(true);
		expect(
			await detectMissedEscalation(
				"I'm forwarding the details to our technical team.",
			),
		).toBe(true);
	});

	it("detects 'notified the team'", async () => {
		mockEscalation(true);
		expect(
			await detectMissedEscalation(
				"I have notified the team about your issue.",
			),
		).toBe(true);
	});

	it("detects 'team has been notified'", async () => {
		mockEscalation(true);
		expect(
			await detectMissedEscalation(
				"The team has been notified of your problem.",
			),
		).toBe(true);
	});

	it("detects 'escalated'", async () => {
		mockEscalation(true);
		expect(
			await detectMissedEscalation(
				"Your case has been escalated to a senior technician.",
			),
		).toBe(true);
	});

	it("detects 'escalating'", async () => {
		mockEscalation(true);
		expect(
			await detectMissedEscalation(
				"I'm escalating this to the support team.",
			),
		).toBe(true);
	});

	it("detects 'someone will contact you'", async () => {
		mockEscalation(true);
		expect(
			await detectMissedEscalation(
				"Someone from our team will contact you shortly.",
			),
		).toBe(true);
	});

	it("detects 'team will reach out'", async () => {
		mockEscalation(true);
		expect(
			await detectMissedEscalation(
				"Our team will reach out to you soon.",
			),
		).toBe(true);
	});

	it("detects 'get back to you'", async () => {
		mockEscalation(true);
		expect(
			await detectMissedEscalation(
				"A colleague will get back to you as soon as possible.",
			),
		).toBe(true);
	});

	it("detects 'sent your details to the team'", async () => {
		mockEscalation(true);
		expect(
			await detectMissedEscalation(
				"I've sent your details to the team for review.",
			),
		).toBe(true);
	});

	it("detects 'refer to team'", async () => {
		mockEscalation(true);
		expect(
			await detectMissedEscalation(
				"I'll refer this to our team for further assistance.",
			),
		).toBe(true);
	});

	it("detects 'referred to team'", async () => {
		mockEscalation(true);
		expect(
			await detectMissedEscalation(
				"Your case has been referred to the support team.",
			),
		).toBe(true);
	});

	it("detects 'team will follow up'", async () => {
		mockEscalation(true);
		expect(
			await detectMissedEscalation(
				"The team will follow up with you shortly.",
			),
		).toBe(true);
	});

	it("detects 'someone from our team'", async () => {
		mockEscalation(true);
		expect(
			await detectMissedEscalation(
				"Someone from our team will help you with the subscription.",
			),
		).toBe(true);
	});

	it("detects 'reach out to you soon'", async () => {
		mockEscalation(true);
		expect(
			await detectMissedEscalation(
				"A representative will reach out to you soon.",
			),
		).toBe(true);
	});

	it("detects 'follow-up with you shortly'", async () => {
		mockEscalation(true);
		expect(
			await detectMissedEscalation(
				"We will follow-up with you shortly regarding this matter.",
			),
		).toBe(true);
	});

	it("detects 'colleague will contact'", async () => {
		mockEscalation(true);
		expect(
			await detectMissedEscalation(
				"A colleague will contact you about this.",
			),
		).toBe(true);
	});

	it("detects 'pass your details to the team'", async () => {
		mockEscalation(true);
		expect(
			await detectMissedEscalation(
				"I'll pass your details to the team right away.",
			),
		).toBe(true);
	});

	// -----------------------------------------------------------------------
	// Edge cases — English
	// -----------------------------------------------------------------------

	it("detects escalation phrase at very start of response", async () => {
		mockEscalation(true);
		expect(await detectMissedEscalation("Escalated. Done.")).toBe(true);
	});

	it("detects escalation phrase at very end of response", async () => {
		mockEscalation(true);
		expect(
			await detectMissedEscalation(
				"I checked your account and it looks like a wiring issue. I've forwarded your request to the team.",
			),
		).toBe(true);
	});

	it("detects escalation in a multi-paragraph response", async () => {
		mockEscalation(true);
		const text = [
			"I've checked your account and everything looks active.",
			"However, your ping results show high latency.",
			"I've notified the team and they will follow up with you soon.",
			"Is there anything else I can help with?",
		].join("\n\n");
		expect(await detectMissedEscalation(text)).toBe(true);
	});

	it("detects multiple escalation phrases in one response", async () => {
		mockEscalation(true);
		expect(
			await detectMissedEscalation(
				"I've forwarded your request to the team. Someone will get back to you shortly. Your case has been escalated.",
			),
		).toBe(true);
	});

	it("does NOT false-positive on 'the team fixed the issue'", async () => {
		mockEscalation(false);
		expect(
			await detectMissedEscalation("The team fixed the issue yesterday."),
		).toBe(false);
	});

	it("does NOT false-positive on technical descriptions with 'forward'", async () => {
		mockEscalation(false);
		expect(
			await detectMissedEscalation(
				"Port forwarding is configured correctly.",
			),
		).toBe(false);
	});

	it("does NOT false-positive on 'I found the issue'", async () => {
		mockEscalation(false);
		expect(
			await detectMissedEscalation(
				"I found the issue — your account expired last week.",
			),
		).toBe(false);
	});

	it("still triggers when escalate-telegram failed (not in toolResults)", async () => {
		mockEscalation(true);
		expect(
			await detectMissedEscalation(
				"I've forwarded your request to the team.",
				[
					{
						toolName: "isp-search-customer",
						args: {},
						result: {},
					},
				],
			),
		).toBe(true);
	});

	// -----------------------------------------------------------------------
	// Arabic phrases
	// -----------------------------------------------------------------------

	it("detects Arabic: سأقوم بتحويل", async () => {
		mockEscalation(true);
		expect(
			await detectMissedEscalation(
				"سأقوم بتحويل طلبك إلى الفريق المختص.",
			),
		).toBe(true);
	});

	it("detects Arabic: تم تحويل", async () => {
		mockEscalation(true);
		expect(
			await detectMissedEscalation("تم تحويل طلبك إلى فريق الدعم الفني."),
		).toBe(true);
	});

	it("detects Arabic: سيتواصل معك", async () => {
		mockEscalation(true);
		expect(
			await detectMissedEscalation("أحد أفراد فريقنا سيتواصل معك قريباً."),
		).toBe(true);
	});

	it("detects Arabic: سنتواصل معك", async () => {
		mockEscalation(true);
		expect(
			await detectMissedEscalation("سنتواصل معك في أقرب وقت ممكن."),
		).toBe(true);
	});

	it("detects Arabic: فريقنا سيتابع", async () => {
		mockEscalation(true);
		expect(await detectMissedEscalation("فريقنا سيتابع الموضوع معك.")).toBe(
			true,
		);
	});

	it("detects Arabic: تم إبلاغ", async () => {
		mockEscalation(true);
		expect(await detectMissedEscalation("تم إبلاغ الفريق بمشكلتك.")).toBe(
			true,
		);
	});

	it("detects Arabic: شخص من فريقنا", async () => {
		mockEscalation(true);
		expect(
			await detectMissedEscalation("شخص من فريقنا سيعاود الاتصال بك."),
		).toBe(true);
	});

	it("detects Arabic: سأبلغ (I will inform)", async () => {
		mockEscalation(true);
		expect(await detectMissedEscalation("سأبلغ الفريق بخصوص مشكلتك.")).toBe(
			true,
		);
	});

	it("detects Arabic: سأرسل للفريق", async () => {
		mockEscalation(true);
		expect(await detectMissedEscalation("سأرسل التفاصيل للفريق.")).toBe(
			true,
		);
	});

	it("detects Arabic: سيعود إليك", async () => {
		mockEscalation(true);
		expect(
			await detectMissedEscalation("أحد الزملاء سيعود إليك قريباً."),
		).toBe(true);
	});

	it("detects Arabic: سيتم التواصل", async () => {
		mockEscalation(true);
		expect(
			await detectMissedEscalation("سيتم التواصل معك بخصوص الطلب."),
		).toBe(true);
	});

	it("detects Arabic: تم إرسال", async () => {
		mockEscalation(true);
		expect(
			await detectMissedEscalation("تم إرسال طلبك إلى الإدارة المختصة."),
		).toBe(true);
	});

	it("does NOT false-positive on plain Arabic greeting", async () => {
		mockEscalation(false);
		expect(
			await detectMissedEscalation("أهلاً وسهلاً، كيف يمكنني مساعدتك؟"),
		).toBe(false);
	});

	it("does NOT false-positive on Arabic diagnostic response", async () => {
		mockEscalation(false);
		expect(
			await detectMissedEscalation(
				"حسابك فعّال والسرعة تبدو طبيعية. الرجاء إعادة تشغيل الراوتر.",
			),
		).toBe(false);
	});

	// -----------------------------------------------------------------------
	// French phrases
	// -----------------------------------------------------------------------

	it("detects French: transféré votre demande", async () => {
		mockEscalation(true);
		expect(
			await detectMissedEscalation(
				"J'ai transféré votre demande à l'équipe technique.",
			),
		).toBe(true);
	});

	it("detects French: demande transférée (reverse order)", async () => {
		mockEscalation(true);
		expect(
			await detectMissedEscalation(
				"Votre demande a été transférée au service concerné.",
			),
		).toBe(true);
	});

	it("detects French: équipe va contacter", async () => {
		mockEscalation(true);
		expect(
			await detectMissedEscalation(
				"Notre équipe va vous contacter prochainement.",
			),
		).toBe(true);
	});

	it("detects French: quelqu'un va vous rappeler", async () => {
		mockEscalation(true);
		expect(
			await detectMissedEscalation(
				"Quelqu'un va vous rappeler dans les plus brefs délais.",
			),
		).toBe(true);
	});

	it("detects French: revenir vers vous", async () => {
		mockEscalation(true);
		expect(
			await detectMissedEscalation(
				"Un collègue va revenir vers vous rapidement.",
			),
		).toBe(true);
	});

	it("does NOT false-positive on plain French diagnostic", async () => {
		mockEscalation(false);
		expect(
			await detectMissedEscalation(
				"Votre connexion fonctionne normalement. Redémarrez votre routeur.",
			),
		).toBe(false);
	});

	// -----------------------------------------------------------------------
	// Mixed language / edge cases
	// -----------------------------------------------------------------------

	it("detects escalation in mixed-language response (Arabic + English)", async () => {
		mockEscalation(true);
		expect(
			await detectMissedEscalation(
				"Your account looks fine. سيتواصل معك أحد الزملاء قريباً.",
			),
		).toBe(true);
	});

	it("detects when only one phrase in a long response matches", async () => {
		mockEscalation(true);
		const longResponse =
			"I have checked your account status, and it is currently active. " +
			"Your speed plan is 50 Mbps and you are getting good signal strength. " +
			"The ping results show low latency at 15ms. " +
			"However, I noticed some intermittent packet loss. " +
			"I've forwarded your request to the technical team for further investigation. " +
			"In the meantime, please try restarting your router.";
		expect(await detectMissedEscalation(longResponse)).toBe(true);
	});

	// -----------------------------------------------------------------------
	// LLM failure fallback
	// -----------------------------------------------------------------------

	it("returns false when classifyText fails (returns null)", async () => {
		mockClassifyFailure();
		expect(
			await detectMissedEscalation(
				"I've forwarded your request to the team.",
			),
		).toBe(false);
	});

	it("passes response text as userPrompt to classifyText", async () => {
		mockEscalation(false);
		const text = "I've escalated your issue.";
		await detectMissedEscalation(text);

		expect(mockClassifyText).toHaveBeenCalledOnce();
		const callArgs = mockClassifyText.mock.calls[0]?.[0] as Record<
			string,
			unknown
		>;
		expect(callArgs["userPrompt"]).toBe(text);
	});
});

// ---------------------------------------------------------------------------
// executeEscalationGuard
// ---------------------------------------------------------------------------

describe("executeEscalationGuard", () => {
	const baseTool = {
		name: "escalate-telegram",
		description: "Escalate to Telegram",
		__toolSide: "server" as const,
	};

	const baseOpts = {
		conversationId: "conv-123",
		customerName: "Ahmad",
		customerPhone: "+961123456",
		conversationMessages: [
			{
				role: "user",
				content: "I want to subscribe to your internet",
			},
			{
				role: "assistant",
				content: "What area are you located in?",
			},
			{ role: "user", content: "Dekwane, near the main road" },
		],
	};

	it("returns null when no missed escalation detected", async () => {
		mockEscalation(false);
		const result = await executeEscalationGuard({
			...baseOpts,
			tools: [{ ...baseTool, execute: vi.fn() }],
			responseText: "Your internet speed is 50 Mbps.",
		});
		expect(result).toBeNull();
	});

	it("returns null when escalate-telegram was already called", async () => {
		const result = await executeEscalationGuard({
			...baseOpts,
			tools: [{ ...baseTool, execute: vi.fn() }],
			responseText: "I've forwarded your request to the team.",
			toolResults: [
				{
					toolName: "escalate-telegram",
					args: {},
					result: { success: true },
				},
			],
		});
		expect(result).toBeNull();
		expect(mockClassifyText).not.toHaveBeenCalled();
	});

	it("returns null when escalate-telegram tool not in tools array", async () => {
		mockEscalation(true);
		const result = await executeEscalationGuard({
			...baseOpts,
			tools: [
				{
					name: "isp-search-customer",
					description: "Search",
					__toolSide: "server" as const,
					execute: vi.fn(),
				},
			],
			responseText: "I've forwarded your request to the team.",
		});
		expect(result).toBeNull();
	});

	it("returns null when tool has no execute function", async () => {
		mockEscalation(true);
		const result = await executeEscalationGuard({
			...baseOpts,
			tools: [{ ...baseTool }],
			responseText: "I've forwarded your request to the team.",
		});
		expect(result).toBeNull();
	});

	it("calls tool execute and returns result when escalation is missed", async () => {
		mockEscalation(true);
		const mockExecute = vi.fn().mockResolvedValue({
			success: true,
			message: "Escalation sent successfully to 1 recipient",
		});

		const result = await executeEscalationGuard({
			...baseOpts,
			tools: [{ ...baseTool, execute: mockExecute }],
			responseText:
				"I've forwarded your request to the team. Someone will reach out to you shortly.",
		});

		expect(result).not.toBeNull();
		expect(result?.toolName).toBe("escalate-telegram");
		expect(result?.result).toEqual({
			success: true,
			message: "Escalation sent successfully to 1 recipient",
		});

		// Verify execute was called with correct args structure
		expect(mockExecute).toHaveBeenCalledOnce();
		const callArgs = mockExecute.mock.calls[0]?.[0] as Record<
			string,
			unknown
		>;
		expect(callArgs["reason"]).toContain("auto-detected");
		expect(callArgs["priority"]).toBe("medium");
		expect(callArgs["summary"]).toContain("Ahmad");
		expect(callArgs["summary"]).toContain("+961123456");
		expect(callArgs["summary"]).toContain("subscribe");
		expect(callArgs["customerName"]).toBe("Ahmad");
	});

	it("includes recent user messages in summary", async () => {
		mockEscalation(true);
		const mockExecute = vi.fn().mockResolvedValue({ success: true });

		await executeEscalationGuard({
			...baseOpts,
			tools: [{ ...baseTool, execute: mockExecute }],
			responseText: "I've sent your details to the team for follow up.",
		});

		const callArgs = mockExecute.mock.calls[0]?.[0] as Record<
			string,
			unknown
		>;
		expect(callArgs["summary"]).toContain("subscribe");
		expect(callArgs["summary"]).toContain("Dekwane");
	});

	it("handles tool execution errors gracefully", async () => {
		mockEscalation(true);
		const mockExecute = vi
			.fn()
			.mockRejectedValue(new Error("Telegram API error"));

		const result = await executeEscalationGuard({
			...baseOpts,
			tools: [{ ...baseTool, execute: mockExecute }],
			responseText: "I've forwarded your request to the team.",
		});

		// Should return null on error, not throw
		expect(result).toBeNull();
	});

	it("works with undefined customerName and customerPhone", async () => {
		mockEscalation(true);
		const mockExecute = vi.fn().mockResolvedValue({ success: true });

		const result = await executeEscalationGuard({
			conversationId: "conv-456",
			customerName: undefined,
			customerPhone: undefined,
			conversationMessages: [
				{ role: "user", content: "I need internet" },
			],
			tools: [{ ...baseTool, execute: mockExecute }],
			responseText: "Someone from our team will contact you soon.",
		});

		expect(result).not.toBeNull();
		const callArgs = mockExecute.mock.calls[0]?.[0] as Record<
			string,
			unknown
		>;
		expect(callArgs["summary"]).toContain("Unknown");
		expect(callArgs["customerName"]).toBeUndefined();
	});

	it("truncates long response text in summary", async () => {
		mockEscalation(true);
		const mockExecute = vi.fn().mockResolvedValue({ success: true });
		const longResponse = "I've forwarded your request to the team. ".repeat(
			50,
		);

		await executeEscalationGuard({
			...baseOpts,
			tools: [{ ...baseTool, execute: mockExecute }],
			responseText: longResponse,
		});

		const callArgs = mockExecute.mock.calls[0]?.[0] as Record<
			string,
			unknown
		>;
		// Summary should include truncated agent response (500 chars max)
		expect((callArgs["summary"] as string).length).toBeLessThan(
			longResponse.length + 200,
		);
	});

	it("detects missed escalation with Arabic response text", async () => {
		mockEscalation(true);
		const mockExecute = vi.fn().mockResolvedValue({ success: true });

		const result = await executeEscalationGuard({
			...baseOpts,
			tools: [{ ...baseTool, execute: mockExecute }],
			responseText:
				"سأقوم بتحويل طلبك إلى الفريق المختص. سيتواصل معك أحد زملائنا قريباً.",
		});

		expect(result).not.toBeNull();
		expect(mockExecute).toHaveBeenCalledOnce();
	});

	it("does not trigger when only search tools were called", async () => {
		mockEscalation(false);
		const mockExecute = vi.fn();

		const result = await executeEscalationGuard({
			...baseOpts,
			tools: [{ ...baseTool, execute: mockExecute }],
			responseText:
				"I found your account. Your plan is 50 Mbps and your connection is active.",
			toolResults: [
				{
					toolName: "isp-search-customer",
					args: {},
					result: { found: true },
				},
			],
		});

		expect(result).toBeNull();
		expect(mockExecute).not.toHaveBeenCalled();
	});

	// -----------------------------------------------------------------------
	// Additional edge cases for executeEscalationGuard
	// -----------------------------------------------------------------------

	it("works with empty conversation messages array", async () => {
		mockEscalation(true);
		const mockExecute = vi.fn().mockResolvedValue({ success: true });

		const result = await executeEscalationGuard({
			conversationId: "conv-789",
			customerName: "Ali",
			customerPhone: "+961999888",
			conversationMessages: [],
			tools: [{ ...baseTool, execute: mockExecute }],
			responseText: "I've escalated your issue to the team.",
		});

		expect(result).not.toBeNull();
		const callArgs = mockExecute.mock.calls[0]?.[0] as Record<
			string,
			unknown
		>;
		// Summary should still contain customer info even with no messages
		expect(callArgs["summary"]).toContain("Ali");
		expect(callArgs["summary"]).toContain("+961999888");
	});

	it("only includes last 5 user messages in summary", async () => {
		mockEscalation(true);
		const mockExecute = vi.fn().mockResolvedValue({ success: true });

		const manyMessages = Array.from({ length: 20 }, (_, i) => ({
			role: i % 2 === 0 ? "user" : "assistant",
			content: `Message ${i}`,
		}));

		await executeEscalationGuard({
			conversationId: "conv-long",
			customerName: "Test",
			conversationMessages: manyMessages,
			tools: [{ ...baseTool, execute: mockExecute }],
			responseText: "Someone from our team will reach out to you.",
		});

		const callArgs = mockExecute.mock.calls[0]?.[0] as Record<
			string,
			unknown
		>;
		const summary = callArgs["summary"] as string;
		// Should only have the last 5 user messages (even indices: 10, 12, 14, 16, 18)
		expect(summary).toContain("Message 18");
		expect(summary).not.toContain("Message 0");
	});

	it("finds escalate-telegram among multiple tools", async () => {
		mockEscalation(true);
		const mockExecute = vi.fn().mockResolvedValue({ success: true });

		const result = await executeEscalationGuard({
			...baseOpts,
			tools: [
				{
					name: "isp-search-customer",
					description: "Search",
					__toolSide: "server" as const,
					execute: vi.fn(),
				},
				{
					name: "isp-ping-customer",
					description: "Ping",
					__toolSide: "server" as const,
					execute: vi.fn(),
				},
				{ ...baseTool, execute: mockExecute },
				{
					name: "isp-bandwidth-stats",
					description: "Bandwidth",
					__toolSide: "server" as const,
					execute: vi.fn(),
				},
			],
			responseText: "I've forwarded your request to the support team.",
		});

		expect(result).not.toBeNull();
		expect(mockExecute).toHaveBeenCalledOnce();
	});

	it("does not call execute when escalate-telegram tool call failed (in toolResults)", async () => {
		const mockExecute = vi.fn();

		const result = await executeEscalationGuard({
			...baseOpts,
			tools: [{ ...baseTool, execute: mockExecute }],
			responseText: "I've forwarded your request to the team.",
			toolResults: [
				{
					toolName: "escalate-telegram",
					args: { reason: "test" },
					result: { success: false, message: "Failed" },
				},
			],
		});

		// Tool WAS called (even if failed), so guard should not re-trigger
		expect(result).toBeNull();
		expect(mockExecute).not.toHaveBeenCalled();
	});

	it("includes agent response snippet in summary", async () => {
		mockEscalation(true);
		const mockExecute = vi.fn().mockResolvedValue({ success: true });

		await executeEscalationGuard({
			...baseOpts,
			tools: [{ ...baseTool, execute: mockExecute }],
			responseText:
				"I've forwarded your request to the technical team. They will check the coverage in your area.",
		});

		const callArgs = mockExecute.mock.calls[0]?.[0] as Record<
			string,
			unknown
		>;
		const summary = callArgs["summary"] as string;
		expect(summary).toContain("Agent response:");
		expect(summary).toContain("coverage");
	});

	it("returns null when classifyText fails during guard check", async () => {
		mockClassifyFailure();
		const mockExecute = vi.fn();

		const result = await executeEscalationGuard({
			...baseOpts,
			tools: [{ ...baseTool, execute: mockExecute }],
			responseText: "I've forwarded your request to the team.",
		});

		expect(result).toBeNull();
		expect(mockExecute).not.toHaveBeenCalled();
	});
});
