import type { ModelMessage } from "ai";
import {
	type BuildSystemPromptOptions,
	buildSystemPromptParts,
} from "./build-system-prompt";
import {
	buildContextGapNote,
	type DbMessageRow,
	dbMessagesToModelMessages,
	findLastHistoryGap,
	formatContextGapNote,
	STALE_HISTORY_MS,
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
	/** Clock for gap detection; defaults to the real time (tests / replays). */
	now?: Date | undefined;
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
	const { staticPrompt, dynamicPrompt } = buildSystemPromptParts({
		...input.systemOptions,
		now: input.systemOptions.now ?? input.now,
	});

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

	// Split the history at the last real pause. Rows before a pause of a
	// week or more are dropped from the context entirely (they stay in the
	// DB): a customer coming back after months is starting over, and old
	// receipts/screenshots left in view get mistaken for new ones.
	let historyRows = input.history;
	let gapNote: string | null = null;
	let gapNoteIdx = 0;
	if (input.contextGapThresholdMinutes !== undefined) {
		const split = findLastHistoryGap(
			historyRows,
			input.contextGapThresholdMinutes,
			input.now,
		);
		if (split) {
			const dropped = split.gapMs >= STALE_HISTORY_MS;
			gapNote = formatContextGapNote(
				split.gapMs,
				split.previousAt,
				dropped,
			);
			if (dropped) {
				historyRows = historyRows.slice(split.index);
				gapNoteIdx = 0;
			} else {
				gapNoteIdx = split.index;
			}
		} else if (input.lastMessageAt) {
			// Rows without timestamps (legacy callers): fall back to the
			// conversation-level timestamp and put the note before the
			// trailing run of user messages.
			gapNote = buildContextGapNote(
				input.lastMessageAt,
				input.contextGapThresholdMinutes,
				input.now,
			);
			gapNoteIdx = historyRows.length;
			while (
				gapNoteIdx > 0 &&
				historyRows[gapNoteIdx - 1]?.role === "user"
			) {
				gapNoteIdx--;
			}
		}
	}

	const before = dbMessagesToModelMessages(historyRows.slice(0, gapNoteIdx));
	const after = dbMessagesToModelMessages(historyRows.slice(gapNoteIdx));
	const historyMessages: ModelMessage[] = [...before];
	if (gapNote && (before.length > 0 || after.length > 0)) {
		historyMessages.push({ role: "user", content: gapNote });
	}
	historyMessages.push(...after);

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
