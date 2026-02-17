import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

const modelMap: Record<string, () => LanguageModel> = {
	"gpt-4.1-mini": () => openai("gpt-4.1-mini"),
	"gpt-4o-mini": () => openai("gpt-4o-mini"),
	"gpt-4o": () => openai("gpt-4o"),
	"gpt-5.2": () => openai("gpt-5.2"),
	"claude-sonnet": () => anthropic("claude-sonnet-4-20250514"),
};

export function getModel(modelId: string): LanguageModel {
	const factory = modelMap[modelId];
	if (!factory) {
		throw new Error(`Unknown model: ${modelId}`);
	}
	return factory();
}

export function isValidModel(modelId: string): boolean {
	return modelId in modelMap;
}
