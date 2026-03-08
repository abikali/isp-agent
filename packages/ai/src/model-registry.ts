import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

const openrouter = createOpenAICompatible({
	name: "openrouter",
	apiKey: process.env["OPENROUTER_API_KEY"] ?? "",
	baseURL: "https://openrouter.ai/api/v1",
});

/**
 * Map short model IDs to OpenRouter model identifiers.
 * All models are routed through OpenRouter — no direct provider SDKs needed.
 */
const modelMap: Record<string, string> = {
	"gpt-4.1": "openai/gpt-4.1",
	"gpt-4.1-mini": "openai/gpt-4.1-mini",
	"gpt-4o-mini": "openai/gpt-4o-mini",
	"gpt-4o": "openai/gpt-4o",
	"gpt-5.2": "openai/gpt-5.2",
	"claude-haiku": "anthropic/claude-haiku-4-5",
	"claude-sonnet": "anthropic/claude-sonnet-4",
	"gemini-3-flash": "google/gemini-3-flash-preview",
	"gemini-2.5-pro": "google/gemini-2.5-pro",
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
