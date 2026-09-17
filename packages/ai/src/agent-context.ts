import { logger } from "@repo/logs";
import type { ModelMessage } from "ai";
import {
	type BuildSystemPromptOptions,
	buildSystemPromptParts,
} from "./build-system-prompt";
import {
	buildContextGapNote,
	type DbMessageRow,
	dbMessagesToModelMessages,
	formatContextGapNote,
	formatDroppedHistoryNote,
	selectHistoryWindow,
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
	/** When set, the chosen history window is logged as `ai-history-window`. */
	conversationId?: string | undefined;
}

/**
 * Assembles the canonical ModelMessage sequence that gets sent to the LLM:
 *
 *   [
 *     { role: 'system', content: STATIC, providerOptions: CACHE_BREAKPOINT_1H },
 *     { role: 'system', content: DYNAMIC }?,        // only when present
 *     { role: 'user', content: headNote }?,           // only when old rows were cut
 *     ...convertedHistory,                            // structured tool-call/tool-result
 *     { role: 'user', content: gapNote }?,            // at the latest pause ≥ threshold
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

	// Rows before a pause of a week or more, and rows two weeks old or more,
	// are dropped from the context entirely (they stay in the DB): a customer
	// coming back after a long silence is starting over, and old receipts,
	// screenshots and names left in view get mistaken for current ones. The
	// latest ordinary pause in what is left gets a notice.
	let historyRows = input.history;
	let headNote: string | null = null;
	let gapNote: string | null = null;
	let gapNoteIdx = 0;
	if (input.contextGapThresholdMinutes !== undefined) {
		const now = input.now ?? new Date();
		const window = selectHistoryWindow(historyRows, {
			thresholdMinutes: input.contextGapThresholdMinutes,
			now,
		});
		if (window) {
			historyRows = window.rows;
			if (window.lastDroppedAt) {
				headNote = formatDroppedHistoryNote(
					window.lastDroppedAt,
					historyRows[0]?.createdAt ?? now,
				);
			}
			if (window.pause) {
				gapNote = formatContextGapNote(
					window.pause.gapMs,
					window.pause.previousAt,
					window.pauseAfterTeammate,
				);
				gapNoteIdx = window.pause.index;
			}
			if (input.conversationId) {
				logger.info("ai-history-window", {
					conversationId: input.conversationId,
					loaded: input.history.length,
					kept: window.rows.length,
					droppedStale: window.droppedStale,
					droppedAge: window.droppedAge,
					pauseNote: window.pause !== null,
					teammateNote: window.pauseAfterTeammate,
				});
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

	const newUserMessage = input.newUserMessage || null;
	const before = dbMessagesToModelMessages(historyRows.slice(0, gapNoteIdx));
	const after = dbMessagesToModelMessages(historyRows.slice(gapNoteIdx));
	const historyMessages: ModelMessage[] = [];
	if (headNote && (historyRows.length > 0 || newUserMessage)) {
		historyMessages.push({ role: "user", content: headNote });
	}
	historyMessages.push(...before);
	if (gapNote && (before.length > 0 || after.length > 0)) {
		historyMessages.push({ role: "user", content: gapNote });
	}
	historyMessages.push(...after);

	messages.push(...historyMessages);

	if (newUserMessage) {
		messages.push({ role: "user", content: newUserMessage });
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
