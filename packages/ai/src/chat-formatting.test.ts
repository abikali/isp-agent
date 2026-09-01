import { describe, expect, it } from "vitest";
import {
	hasToolNarration,
	stripToolNarration,
	toChatFormatting,
} from "./chat-formatting";

// ---------------------------------------------------------------------------
// Tool-call narration
//
// Production samples: models occasionally write the tool call out as prose
// instead of emitting it, and the bracketed stage direction was shipped
// verbatim to the customer over WhatsApp.
// ---------------------------------------------------------------------------

describe("stripToolNarration", () => {
	it("removes the narration but keeps the sentence around it", () => {
		const text =
			'أهلاً بك. رح أعمل فحص هلق لخطك لأعرف سبب المشكلة وبخبرك بالنتيجة فوراً.\n\n[runs isp-diagnose-customer with "youssef kamal"]';

		expect(stripToolNarration(text)).toBe(
			"أهلاً بك. رح أعمل فحص هلق لخطك لأعرف سبب المشكلة وبخبرك بالنتيجة فوراً.",
		);
	});

	it.each([
		'[runs isp-diagnose-customer with query: "makhloufmakhloufi65"]',
		"[runs isp-diagnose-customer with query=9613944239]",
		"[runs isp-diagnose-customer for 96170191014]",
		"[calls escalate-telegram]",
		"(using speed-test now)",
	])("strips %s", (narration) => {
		expect(stripToolNarration(`Checking. ${narration}`)).toBe("Checking.");
	});

	it("leaves ordinary bracketed text alone", () => {
		const text = "الخطة عندك [8 ميغا] وهيدا السعر المتفق عليه.";
		expect(stripToolNarration(text)).toBe(text);
	});

	it("leaves a bracket without a real tool name alone", () => {
		const text = "Your router [model TP-Link] supports 2.4GHz.";
		expect(stripToolNarration(text)).toBe(text);
	});

	it("collapses the blank space the removal leaves behind", () => {
		expect(stripToolNarration("One.\n\n[runs ping-host]\n\n\nTwo.")).toBe(
			"One.\n\nTwo.",
		);
	});
});

describe("hasToolNarration", () => {
	it("detects narration on repeated calls (global regex is not sticky)", () => {
		const text = "Checking now. [runs isp-search-customer for saman]";
		expect(hasToolNarration(text)).toBe(true);
		expect(hasToolNarration(text)).toBe(true);
	});

	it("is false for a normal reply", () => {
		expect(hasToolNarration("Your connection looks healthy.")).toBe(false);
	});
});

describe("toChatFormatting", () => {
	it("strips narration as part of the outbound transform", () => {
		expect(
			toChatFormatting("**Update:** checking. [runs isp-ping-customer]"),
		).toBe("*Update:* checking.");
	});

	it("still converts markdown", () => {
		expect(toChatFormatting("## Title\n**bold** and __italic__")).toBe(
			"*Title*\n*bold* and _italic_",
		);
	});
});
