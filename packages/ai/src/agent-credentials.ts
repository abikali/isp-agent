import { generateText } from "ai";
import { decryptToken } from "./encryption";
import {
	type AiProvider,
	getModel,
	isAiProvider,
	type ModelCredentials,
} from "./model-registry";

export const MISSING_API_KEY_MESSAGE =
	"This AI agent has no API key. Add one in the agent's Model settings.";

/**
 * The credentials every LLM call for this agent runs on. There is no
 * server-wide fallback key: an agent without one throws, and the caller's
 * existing error path handles it like any other failed generation.
 */
export function resolveAgentCredentials(agent: {
	provider: string;
	encryptedApiKey: string | null;
}): ModelCredentials {
	if (!agent.encryptedApiKey) {
		throw new Error(MISSING_API_KEY_MESSAGE);
	}
	const provider: AiProvider = isAiProvider(agent.provider)
		? agent.provider
		: "openrouter";
	return { provider, apiKey: decryptToken(agent.encryptedApiKey) };
}

/** Last four characters, for "sk-…a1b2" hints. The key itself never leaves the server. */
export function apiKeyHint(encryptedApiKey: string | null): string | null {
	if (!encryptedApiKey) {
		return null;
	}
	try {
		return decryptToken(encryptedApiKey).slice(-4);
	} catch {
		return null;
	}
}

/**
 * One tiny generation to prove the key works for this provider and model.
 * Returns the provider's own error message on failure.
 */
export async function testModelCredentials(
	modelId: string,
	credentials: ModelCredentials,
): Promise<{ ok: true; latencyMs: number } | { ok: false; error: string }> {
	const start = Date.now();
	try {
		await generateText({
			model: getModel(modelId, credentials, { usage: false }),
			messages: [{ role: "user", content: "Reply with OK." }],
			maxOutputTokens: 16,
			abortSignal: AbortSignal.timeout(20_000),
		});
		return { ok: true, latencyMs: Date.now() - start };
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}
