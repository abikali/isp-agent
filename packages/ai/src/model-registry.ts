import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { JSONValue, LanguageModel } from "ai";

/**
 * Structural type for `providerOptions` payloads — AI SDK v6 doesn't
 * re-export the underlying `SharedV3ProviderOptions` from `@ai-sdk/provider`,
 * so we declare the compatible shape locally.
 */
type ProviderOptions = Record<string, Record<string, JSONValue>>;

const APP_NAME = "LibanCom ISP";
const APP_URL = process.env["APP_URL"] ?? "https://libancom.com";

const openrouter = createOpenRouter({
	apiKey: process.env["OPENROUTER_API_KEY"] ?? "",
	headers: {
		"HTTP-Referer": APP_URL,
		"X-Title": APP_NAME,
	},
	extraBody: {
		provider: {
			// Resilience: let OpenRouter fall back to another upstream if the
			// preferred one returns errors. Set false on a per-model basis
			// later if a model can't be served from any other endpoint.
			allow_fallbacks: true,
			// Data privacy: only route to upstream providers that don't train
			// on prompts. Drop this flag if you want broader provider access.
			data_collection: "deny",
		},
	},
});

/**
 * Map short model IDs to OpenRouter model identifiers.
 * Validated against OpenRouter `/api/v1/models` on 2026-05-13.
 *
 * Selection criteria:
 * - Production-grade models only (no preview unless required)
 * - Models that support tool calling
 * - Coverage across price/quality tiers (nano/mini < flash < mini < gpt-4o < sonnet/pro)
 */
const modelMap: Record<string, string> = {
	// OpenAI
	"gpt-4.1": "openai/gpt-4.1",
	"gpt-4.1-mini": "openai/gpt-4.1-mini",
	"gpt-4.1-nano": "openai/gpt-4.1-nano",
	"gpt-4o-mini": "openai/gpt-4o-mini",
	"gpt-4o": "openai/gpt-4o",
	"gpt-5.4-mini": "openai/gpt-5.4-mini",
	"gpt-5.4": "openai/gpt-5.4",
	// Anthropic — `cacheControl: { type: 'ephemeral' }` supported
	"claude-haiku": "anthropic/claude-haiku-4.5",
	"claude-sonnet": "anthropic/claude-sonnet-4.5",
	"claude-sonnet-4.6": "anthropic/claude-sonnet-4.6",
	"claude-opus": "anthropic/claude-opus-4.5",
	// Google
	"gemini-2.5-flash": "google/gemini-2.5-flash",
	"gemini-2.5-flash-lite": "google/gemini-2.5-flash-lite",
	"gemini-2.5-pro": "google/gemini-2.5-pro",
	"gemini-3-flash": "google/gemini-3-flash-preview",
	"gemini-3.1-flash-lite": "google/gemini-3.1-flash-lite",
	// Mistral
	"mistral-large": "mistralai/mistral-large-2512",
	"mistral-medium": "mistralai/mistral-medium-3.1",
	// DeepSeek
	"deepseek-v3": "deepseek/deepseek-v3.2",
};

export interface GetModelOptions {
	/** Forward extra usage tracking; defaults to true (returns cost in providerMetadata). */
	usage?: boolean;
}

export function getModel(
	modelId: string,
	options: GetModelOptions = {},
): LanguageModel {
	const openRouterId = modelMap[modelId];
	if (!openRouterId) {
		throw new Error(`Unknown model: ${modelId}`);
	}
	return openrouter.chat(openRouterId, {
		usage: { include: options.usage !== false },
	});
}

export function isValidModel(modelId: string): boolean {
	return modelId in modelMap;
}

export function listAvailableModels(): string[] {
	return Object.keys(modelMap);
}

/**
 * Ephemeral cache breakpoint marker for OpenRouter-routed Anthropic models.
 * Apply to any text part that should mark the END of a cacheable prefix.
 *
 * Anthropic charges ~25% extra to *write* the cache and gives ~90% discount
 * to *read* it, so this pays for itself after the second hit within the TTL
 * window (5 min default, 1h with ttl: '1h').
 *
 * Has no effect on non-Anthropic models — safe to pass unconditionally.
 */
export const CACHE_BREAKPOINT: ProviderOptions = {
	openrouter: { cacheControl: { type: "ephemeral" } },
	// Mirror under the anthropic key too, for direct-provider use.
	anthropic: { cacheControl: { type: "ephemeral" } },
};

/** 1-hour cache TTL — use for long-lived system prompts shared across many calls. */
export const CACHE_BREAKPOINT_1H: ProviderOptions = {
	openrouter: { cacheControl: { type: "ephemeral", ttl: "1h" } },
	anthropic: { cacheControl: { type: "ephemeral", ttl: "1h" } },
};
