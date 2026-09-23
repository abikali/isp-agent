import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
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

export const AI_PROVIDERS = [
	"openrouter",
	"openai",
	"anthropic",
	"google",
] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

/**
 * Which provider to call and the key to call it with. Every LLM call takes
 * one: keys live on the agent (`AiAgent.encryptedApiKey`), never in env.
 */
export interface ModelCredentials {
	provider: AiProvider;
	apiKey: string;
}

export function isAiProvider(value: string): value is AiProvider {
	return (AI_PROVIDERS as readonly string[]).includes(value);
}

/**
 * Short model ID → the provider-native ID for each provider that serves it.
 * `openrouter` covers every model; the direct providers only their own.
 * OpenRouter IDs validated against `/api/v1/models` on 2026-05-13.
 *
 * Selection criteria:
 * - Production-grade models only (no preview unless required)
 * - Models that support tool calling
 * - Coverage across price/quality tiers (nano/mini < flash < mini < gpt-4o < sonnet/pro)
 */
const modelMap: Record<
	string,
	{ openrouter: string } & Partial<
		Record<Exclude<AiProvider, "openrouter">, string>
	>
> = {
	// OpenAI
	"gpt-4.1": { openrouter: "openai/gpt-4.1", openai: "gpt-4.1" },
	"gpt-4.1-mini": {
		openrouter: "openai/gpt-4.1-mini",
		openai: "gpt-4.1-mini",
	},
	"gpt-4.1-nano": {
		openrouter: "openai/gpt-4.1-nano",
		openai: "gpt-4.1-nano",
	},
	"gpt-4o-mini": { openrouter: "openai/gpt-4o-mini", openai: "gpt-4o-mini" },
	"gpt-4o": { openrouter: "openai/gpt-4o", openai: "gpt-4o" },
	"gpt-5.4-mini": {
		openrouter: "openai/gpt-5.4-mini",
		openai: "gpt-5.4-mini",
	},
	"gpt-5.4": { openrouter: "openai/gpt-5.4", openai: "gpt-5.4" },
	// Anthropic — `cacheControl: { type: 'ephemeral' }` supported
	"claude-haiku": {
		openrouter: "anthropic/claude-haiku-4.5",
		anthropic: "claude-haiku-4-5",
	},
	"claude-sonnet": {
		openrouter: "anthropic/claude-sonnet-4.5",
		anthropic: "claude-sonnet-4-5",
	},
	"claude-sonnet-4.6": {
		openrouter: "anthropic/claude-sonnet-4.6",
		anthropic: "claude-sonnet-4-6",
	},
	"claude-opus": {
		openrouter: "anthropic/claude-opus-4.5",
		anthropic: "claude-opus-4-5",
	},
	// Google
	"gemini-2.5-flash": {
		openrouter: "google/gemini-2.5-flash",
		google: "gemini-2.5-flash",
	},
	"gemini-2.5-flash-lite": {
		openrouter: "google/gemini-2.5-flash-lite",
		google: "gemini-2.5-flash-lite",
	},
	"gemini-2.5-pro": {
		openrouter: "google/gemini-2.5-pro",
		google: "gemini-2.5-pro",
	},
	"gemini-3-flash": {
		openrouter: "google/gemini-3-flash-preview",
		google: "gemini-3-flash-preview",
	},
	"gemini-3.1-flash-lite": { openrouter: "google/gemini-3.1-flash-lite" },
	// Z.AI — GLM. Tool calling verified against the live endpoint on
	// 2026-09-01: called isp-diagnose-customer on a Lebanese-Arabic fault
	// report, and escalate-telegram on a needsHumanFollowUp diagnosis.
	// Served by ~20 providers whose tool-call parsing differs; OpenRouter's
	// Auto Exacto routing (on by default for tool-carrying requests) is what
	// keeps that variance from showing up as dropped tool calls.
	"glm-5.3-flash": { openrouter: "z-ai/glm-5.3-flash" },
	// Mistral
	"mistral-large": { openrouter: "mistralai/mistral-large-2512" },
	"mistral-medium": { openrouter: "mistralai/mistral-medium-3.1" },
	// DeepSeek
	"deepseek-v3": { openrouter: "deepseek/deepseek-v3.2" },
};

export interface GetModelOptions {
	/** Forward extra usage tracking; defaults to true (returns cost in providerMetadata). */
	usage?: boolean;
	/**
	 * OpenRouter session ID (≤256 chars — use the conversation ID). Makes
	 * provider routing sticky across the turns of a conversation so prompt
	 * caches stay warm instead of bouncing between upstreams.
	 */
	sessionId?: string | undefined;
}

function createOpenRouterProvider(apiKey: string) {
	return createOpenRouter({
		apiKey,
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
}

export function getModel(
	modelId: string,
	credentials: ModelCredentials,
	options: GetModelOptions = {},
): LanguageModel {
	const ids = modelMap[modelId];
	if (!ids) {
		throw new Error(`Unknown model: ${modelId}`);
	}
	const { provider, apiKey } = credentials;
	if (provider === "openrouter") {
		return createOpenRouterProvider(apiKey).chat(ids.openrouter, {
			usage: { include: options.usage !== false },
			...(options.sessionId
				? { extraBody: { session_id: options.sessionId.slice(0, 256) } }
				: {}),
		});
	}
	const nativeId = ids[provider];
	if (!nativeId) {
		throw new Error(`Model ${modelId} is not available from ${provider}`);
	}
	switch (provider) {
		case "openai":
			return createOpenAI({ apiKey })(nativeId);
		case "anthropic":
			return createAnthropic({ apiKey })(nativeId);
		case "google":
			return createGoogleGenerativeAI({ apiKey })(nativeId);
	}
}

export function isValidModel(modelId: string): boolean {
	return modelId in modelMap;
}

/** Can `provider` serve `modelId`? OpenRouter serves every model. */
export function isModelAvailable(
	modelId: string,
	provider: AiProvider,
): boolean {
	const ids = modelMap[modelId];
	return Boolean(ids && (provider === "openrouter" || ids[provider]));
}

/**
 * The cheap model each provider uses for background helpers: triage,
 * escalation checks/summaries, image and PDF reading. "nano" is the
 * cheapest tier, used where the output is a small JSON verdict.
 */
export function helperModelId(
	provider: AiProvider,
	tier: "mini" | "nano" = "mini",
): string {
	switch (provider) {
		case "openrouter":
		case "openai":
			return tier === "nano" ? "gpt-4.1-nano" : "gpt-4.1-mini";
		case "anthropic":
			return "claude-haiku";
		case "google":
			return tier === "nano"
				? "gemini-2.5-flash-lite"
				: "gemini-2.5-flash";
	}
}

/**
 * Models whose sampling parameters should be left at provider defaults.
 * Google's Gemini 3 guidance is explicit: changing temperature/top_p on
 * 3.x causes looping and degraded reasoning — keep the defaults.
 */
export function usesProviderDefaultSampling(modelId: string): boolean {
	return modelId.startsWith("gemini-3");
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
