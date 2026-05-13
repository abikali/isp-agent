import type { ModelMessage } from "ai";
import {
	type BuildSystemPromptOptions,
	buildSystemPromptParts,
} from "./build-system-prompt";
import {
	buildContextGapNote,
	type DbMessageRow,
	dbMessagesToModelMessages,
} from "./history";
import { CACHE_BREAKPOINT_1H } from "./model-registry";

export interface BuildAgentMessagesInput {
	/** Options forwarded to buildSystemPromptParts. */
	systemOptions: BuildSystemPromptOptions;
	/** Prior conversation rows (chronological order). */
	history: DbMessageRow[];
	/**
	 * Optional new user message that hasn't been persisted to history yet.
	 * Appended at the end. If the caller already stored the message and
	 * loaded it as part of `history`, leave this undefined.
	 */
	newUserMessage?: string | undefined;
	/**
	 * Timestamp of the LAST message in this conversation prior to `history`
	 * being loaded. Used to inject a context-gap note when there's been a long
	 * pause. Pass `null` for brand-new conversations.
	 */
	lastMessageAt?: Date | null | undefined;
	/** Threshold (minutes) above which the context-gap note is injected. */
	contextGapThresholdMinutes?: number | undefined;
}

/**
 * Assembles the canonical ModelMessage sequence that gets sent to the LLM:
 *
 *   [
 *     { role: 'system', content: STATIC, providerOptions: CACHE_BREAKPOINT_1H },
 *     { role: 'system', content: DYNAMIC }?,        // only when present
 *     ...convertedHistory,                            // structured tool-call/tool-result
 *     { role: 'user', content: gapNote }?,            // only when gap threshold exceeded
 *     { role: 'user', content: newUserMessage }?,     // only when caller passes one
 *   ]
 *
 * The static system prompt gets an Anthropic ephemeral cache breakpoint
 * (mirrored under the openrouter key so OpenRouter proxies the flag through).
 * Anthropic charges ~25% more for the FIRST request to cache; subsequent
 * requests within the 5-minute (or 1-hour) TTL pay ~10% of the input price
 * for those cached tokens. Single-conversation sequences pay this back after
 * the second turn, so for multi-turn agents this is a meaningful saving.
 */
export function buildAgentMessages(
	input: BuildAgentMessagesInput,
): ModelMessage[] {
	const { staticPrompt, dynamicPrompt } = buildSystemPromptParts(
		input.systemOptions,
	);

	const messages: ModelMessage[] = [];

	if (staticPrompt) {
		messages.push({
			role: "system",
			content: staticPrompt,
			providerOptions: CACHE_BREAKPOINT_1H,
		});
	}

	if (dynamicPrompt) {
		messages.push({ role: "system", content: dynamicPrompt });
	}

	const historyMessages = dbMessagesToModelMessages(input.history);

	// Inject context-gap note BEFORE the trailing run of user messages so the
	// model treats the gap as preceding everything the user said after coming
	// back.
	if (input.lastMessageAt && input.contextGapThresholdMinutes !== undefined) {
		const gapNote = buildContextGapNote(
			input.lastMessageAt,
			input.contextGapThresholdMinutes,
		);
		if (gapNote && historyMessages.length > 0) {
			let insertIdx = historyMessages.length;
			while (
				insertIdx > 0 &&
				historyMessages[insertIdx - 1]?.role === "user"
			) {
				insertIdx--;
			}
			historyMessages.splice(insertIdx, 0, {
				role: "user",
				content: gapNote,
			});
		}
	}

	messages.push(...historyMessages);

	if (input.newUserMessage !== undefined && input.newUserMessage !== "") {
		messages.push({ role: "user", content: input.newUserMessage });
	}

	return messages;
}

export interface BuildTelemetryInput {
	conversationId: string;
	agentId: string;
	organizationId: string;
	channelId?: string | null | undefined;
	provider?: string | undefined;
	verifiedCustomerId?: string | null | undefined;
}

/**
 * Construct telemetry metadata for the LLM call. Wired into AI SDK's
 * `experimental_telemetry` — Langfuse / Phoenix / OpenTelemetry exporters
 * will surface it on the trace span.
 */
export function buildAgentTelemetry(input: BuildTelemetryInput) {
	return {
		isEnabled: true,
		functionId: "ai-agent.run",
		metadata: {
			agentId: input.agentId,
			conversationId: input.conversationId,
			organizationId: input.organizationId,
			...(input.channelId
				? { channelId: input.channelId }
				: { channel: "web" }),
			...(input.provider ? { provider: input.provider } : {}),
			...(input.verifiedCustomerId
				? { verifiedCustomerId: input.verifiedCustomerId }
				: {}),
		},
	};
}
