import { generateText, Output } from "ai";
import type { z } from "zod";
import { getModel } from "./model-registry";

interface ClassifyOptions<T extends z.ZodType> {
	systemPrompt: string;
	userPrompt: string;
	schema: T;
	model?: string | undefined;
	timeoutMs?: number | undefined;
}

/**
 * Lightweight LLM classification helper.
 * Uses generateText() + Output.object() for structured output — the provider handles
 * JSON mode and the SDK validates against the schema automatically.
 *
 * Returns null on any failure (timeout, validation, API error) — never throws.
 */
export async function classifyText<T extends z.ZodType>(
	opts: ClassifyOptions<T>,
): Promise<z.infer<T> | null> {
	const model = opts.model ?? "gpt-4.1-mini";
	const timeoutMs = opts.timeoutMs ?? 5000;

	const abortController = new AbortController();
	const timer = setTimeout(() => abortController.abort(), timeoutMs);

	try {
		const result = await generateText({
			model: getModel(model),
			system: opts.systemPrompt,
			// Append "Respond in JSON." — some OpenRouter-routed providers (Azure OpenAI)
			// require the word "json" in the message when using json_object response format.
			messages: [
				{
					role: "user",
					content: `${opts.userPrompt}\n\nRespond in JSON.`,
				},
			],
			output: Output.object({ schema: opts.schema }),
			temperature: 0,
			abortSignal: abortController.signal,
		});

		// Helper LLM calls (triage, escalation guard, summaries) are invisible
		// in per-message token columns — emit a greppable usage line instead.
		// biome-ignore lint/suspicious/noConsole: logger from @repo/logs breaks client bundle (Rollup can't resolve it)
		console.info("helper-llm-usage", {
			fn: "classifyText",
			model,
			inputTokens: result.usage?.inputTokens ?? 0,
			outputTokens: result.usage?.outputTokens ?? 0,
		});

		return (result.output ?? null) as z.infer<T> | null;
	} catch (error) {
		// biome-ignore lint/suspicious/noConsole: logger from @repo/logs breaks client bundle (Rollup can't resolve it)
		console.warn("classifyText failed, returning null", {
			model,
			error: error instanceof Error ? error.message : String(error),
		});
		return null;
	} finally {
		clearTimeout(timer);
	}
}
