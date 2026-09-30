import type { ModelCredentials } from "./model-registry";

/**
 * Spoken replies to voice notes (#18). Only OpenAI direct is supported: its
 * `gpt-4o-mini-tts` speaks Arabic, takes accent instructions and returns
 * Opus — a real WhatsApp voice-note format with no ffmpeg in the worker.
 * Other providers return null and the customer gets the text reply only.
 */

export const DEFAULT_TTS_MODEL = "gpt-4o-mini-tts";
const TTS_VOICE = "alloy";
const TTS_INSTRUCTIONS =
	"Speak in a warm, natural Lebanese Arabic accent, at a relaxed pace, like a friendly support agent. Read English words and numbers naturally.";
const MAX_SPOKEN_CHARS = 400;

export function supportsVoiceReplies(provider: string): boolean {
	return provider === "openai";
}

/**
 * Only short conversational replies are spoken. Anything with a link, an
 * account/username, a number or a list must stay readable, and the text is
 * always sent as well.
 */
export function isSpeakableReply(text: string): boolean {
	const t = text.trim();
	if (!t || t.length > MAX_SPOKEN_CHARS) {
		return false;
	}
	if (/https?:\/\/|www\.|\S+@\S+/i.test(t)) {
		return false;
	}
	// Digits (Latin or Arabic-Indic): prices, invoices, usernames, phones.
	if (/[0-9٠-٩۰-۹]/.test(t)) {
		return false;
	}
	// Bulleted or numbered lists, and ASCII usernames like "rola_h".
	if (/^\s*[-*•]\s/m.test(t) || /\b[a-z]+[._][a-z]+\b/i.test(t)) {
		return false;
	}
	return true;
}

export interface SynthesizedSpeech {
	bytes: Buffer;
	mime: string;
	extension: string;
}

/** Render `text` as speech; null when unsupported or on any failure. */
export async function synthesizeSpeech(
	credentials: ModelCredentials,
	text: string,
	model?: string | null,
): Promise<SynthesizedSpeech | null> {
	if (!supportsVoiceReplies(credentials.provider)) {
		return null;
	}
	try {
		const response = await fetch("https://api.openai.com/v1/audio/speech", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${credentials.apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: model || DEFAULT_TTS_MODEL,
				voice: TTS_VOICE,
				input: text,
				instructions: TTS_INSTRUCTIONS,
				response_format: "opus",
			}),
			signal: AbortSignal.timeout(30_000),
		});
		if (!response.ok) {
			// biome-ignore lint/suspicious/noConsole: logger from @repo/logs breaks client bundle (Rollup can't resolve it)
			console.warn("synthesizeSpeech failed", {
				status: response.status,
			});
			return null;
		}
		const bytes = Buffer.from(await response.arrayBuffer());
		return bytes.length > 0
			? { bytes, mime: "audio/ogg; codecs=opus", extension: "ogg" }
			: null;
	} catch (error) {
		// biome-ignore lint/suspicious/noConsole: logger from @repo/logs breaks client bundle (Rollup can't resolve it)
		console.warn("synthesizeSpeech failed", {
			error: error instanceof Error ? error.message : String(error),
		});
		return null;
	}
}
