import type { AnyTextAdapter } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";
import { openaiText } from "@tanstack/ai-openai";

const adapterMap: Record<string, () => AnyTextAdapter> = {
	"gpt-4.1": () => openaiText("gpt-4.1"),
	"gpt-4.1-mini": () => openaiText("gpt-4.1-mini"),
	"gpt-4o-mini": () => openaiText("gpt-4o-mini"),
	"gpt-4o": () => openaiText("gpt-4o"),
	"gpt-5.2": () => openaiText("gpt-5.2"),
	"claude-haiku": () => anthropicText("claude-haiku-4-5"),
	"claude-sonnet": () => anthropicText("claude-sonnet-4"),
};

export function getAdapter(modelId: string): AnyTextAdapter {
	const factory = adapterMap[modelId];
	if (!factory) {
		throw new Error(`Unknown model: ${modelId}`);
	}
	return factory();
}

export function isValidModel(modelId: string): boolean {
	return modelId in adapterMap;
}
