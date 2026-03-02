import { logger } from "@repo/logs";
import type { InferSchemaType, SchemaInput } from "@tanstack/ai";
import { chat } from "@tanstack/ai";
import { getAdapter } from "./model-registry";

interface ClassifyOptions<T extends SchemaInput> {
	systemPrompt: string;
	userPrompt: string;
	schema: T;
	model?: string | undefined;
	timeoutMs?: number | undefined;
}

/**
 * Lightweight LLM classification helper.
 * Uses chat() + outputSchema for structured output — the provider handles
 * JSON mode and the SDK validates against the schema automatically.
 *
 * Returns null on any failure (timeout, validation, API error) — never throws.
 */
export async function classifyText<T extends SchemaInput>(
	opts: ClassifyOptions<T>,
): Promise<InferSchemaType<T> | null> {
	const model = opts.model ?? "gpt-4.1-mini";
	const timeoutMs = opts.timeoutMs ?? 5000;

	const abortController = new AbortController();
	const timer = setTimeout(() => abortController.abort(), timeoutMs);

	try {
		const result = await chat({
			adapter: getAdapter(model),
			messages: [{ role: "user", content: opts.userPrompt }],
			systemPrompts: [opts.systemPrompt],
			outputSchema: opts.schema,
			temperature: 0,
			abortController,
		});

		return result as InferSchemaType<T>;
	} catch (error) {
		logger.warn("classifyText failed, returning null", {
			model,
			error: error instanceof Error ? error.message : String(error),
		});
		return null;
	} finally {
		clearTimeout(timer);
	}
}
