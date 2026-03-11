import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

const openrouter = createOpenAICompatible({
	name: "openrouter",
	apiKey: process.env["OPENROUTER_API_KEY"] ?? "",
	baseURL: "https://openrouter.ai/api/v1",
	supportsStructuredOutputs: true,
});

/**
 * Map short model IDs to OpenRouter model identifiers.
 * All models are routed through OpenRouter — no direct provider SDKs needed.
 */
const modelMap: Record<string, string> = {
	// OpenAI
	"gpt-4.1": "openai/gpt-4.1",
	"gpt-4.1-mini": "openai/gpt-4.1-mini",
	"gpt-4.1-nano": "openai/gpt-4.1-nano",
	"gpt-4o-mini": "openai/gpt-4o-mini",
	"gpt-4o": "openai/gpt-4o",
	"gpt-5.2": "openai/gpt-5.2",
	// Anthropic
	"claude-haiku": "anthropic/claude-haiku-4-5",
	"claude-sonnet": "anthropic/claude-sonnet-4",
	// Google
	"gemini-2.5-flash": "google/gemini-2.5-flash",
	"gemini-2.5-flash-lite": "google/gemini-2.5-flash-lite",
	"gemini-2.5-pro": "google/gemini-2.5-pro",
	"gemini-3-flash": "google/gemini-3-flash-preview",
	"gemini-3.1-flash-lite": "google/gemini-3.1-flash-lite-preview",
	// Mistral
	"mistral-large": "mistralai/mistral-large-2512",
	"mistral-medium": "mistralai/mistral-medium-3.1",
	// Qwen
	"qwen-3.5": "qwen/qwen3.5-397b-a17b",
	// DeepSeek
	"deepseek-v3": "deepseek/deepseek-v3.2",
};

export function getModel(modelId: string): LanguageModel {
	const openRouterId = modelMap[modelId];
	if (!openRouterId) {
		throw new Error(`Unknown model: ${modelId}`);
	}
	return openrouter(openRouterId);
}

export function isValidModel(modelId: string): boolean {
	return modelId in modelMap;
}
