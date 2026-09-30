import { afterEach, describe, expect, it, vi } from "vitest";
import {
	isSpeakableReply,
	supportsVoiceReplies,
	synthesizeSpeech,
} from "./tts";

describe("isSpeakableReply", () => {
	it("speaks short conversational replies", () => {
		expect(isSpeakableReply("أهلا! الخط شغال هلق، جرب ورجعلي خبر.")).toBe(
			true,
		);
	});

	it.each([
		"Your invoice is 25$",
		"فاتورتك ٢٥ دولار",
		"See https://libancom.co",
		"Your username is rola_h",
		"- first\n- second",
		"x".repeat(401),
	])("keeps %s as text only", (text) => {
		expect(isSpeakableReply(text)).toBe(false);
	});
});

describe("synthesizeSpeech", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("only supports OpenAI direct", async () => {
		expect(supportsVoiceReplies("openai")).toBe(true);
		expect(supportsVoiceReplies("openrouter")).toBe(false);
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const result = await synthesizeSpeech(
			{ provider: "openrouter", apiKey: "k" },
			"hello",
		);
		expect(result).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("asks OpenAI for an Opus voice note", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(
				new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
			);
		vi.stubGlobal("fetch", fetchMock);
		const result = await synthesizeSpeech(
			{ provider: "openai", apiKey: "sk-test" },
			"مرحبا",
		);
		expect(result?.mime).toContain("opus");
		expect(result?.bytes.length).toBe(3);
		const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
		expect(body).toMatchObject({
			model: "gpt-4o-mini-tts",
			response_format: "opus",
			input: "مرحبا",
		});
	});

	it("returns null when OpenAI refuses", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response("no", { status: 401 })),
		);
		expect(
			await synthesizeSpeech({ provider: "openai", apiKey: "bad" }, "hi"),
		).toBeNull();
	});
});
