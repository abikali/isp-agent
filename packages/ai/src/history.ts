import { beirutParts } from "@repo/utils";
import type { ModelMessage, UIMessage } from "ai";
import { stripInternalMarkers } from "./chat-formatting";
import type { ToolResult } from "./types";

/** Gaps at least this long drop the earlier exchange from the model context. */
export const STALE_HISTORY_MS = 7 * 24 * 60 * 60_000;

/**
 * Age backstop: rows at least this old never reach the model, even when the
 * chat never paused for a full week (e.g. a customer writing every 3 days).
 */
export const MAX_HISTORY_AGE_MS = 14 * 24 * 60 * 60_000;

/**
 * Builds a context gap note to inject into message history when there's been
 * a significant time gap between messages. Returns null if no gap or below threshold.
 */
export function buildContextGapNote(
	lastMessageAt: Date | null,
	thresholdMinutes: number,
	now: Date = new Date(),
): string | null {
	if (!lastMessageAt) {
		return null;
	}

	const gapMs = now.getTime() - lastMessageAt.getTime();
	if (gapMs < thresholdMinutes * 60_000) {
		return null;
	}

	return formatContextGapNote(gapMs, lastMessageAt, false);
}

/**
 * The note placed at a pause inside the visible history. The earlier exchange
 * is still above the note, so it has to stop the model from treating its
 * attachments as freshly sent — a two-month-old Whish receipt was once
 * replayed to the customer as "I received your transfer picture" and
 * escalated as proof of a new payment.
 *
 * `afterTeammate` = the row right before the pause is a human teammate's
 * message. The customer is then most likely answering that teammate (Jhonny
 * asks "is the money ready?", the customer replies five hours later), so the
 * note must point the model AT that message instead of filing it under
 * "earlier exchange" — which is what made the bot reopen an unrelated
 * month-old transfer instead.
 */
export function formatContextGapNote(
	gapMs: number,
	previousAt: Date,
	afterTeammate: boolean,
): string {
	const duration = formatGapDuration(gapMs);
	if (afterTeammate) {
		return `[Context Notice: ${duration} have passed since the last message. The message just above this notice is from a human teammate (sent ${formatBeirutDateTime(previousAt)} Beirut time). The customer's new message is most likely a reply to that teammate — read it in that light and do not reopen older topics. Images, receipts, transfer details and promises from before that were sent back then — the customer has NOT re-sent them now, so never say you received them and never cite them as proof for the new message.]`;
	}
	const ended = previousAt.toISOString().slice(0, 10);
	return `[Context Notice: ${duration} have passed since the last message. Everything above this notice is an earlier exchange that ended on ${ended}. Images, receipts, transfer details and promises up there were sent back then — the customer has NOT re-sent them now, so never say you received them and never cite them as proof for the new message. Do not assume continuity — let their new message guide you.]`;
}

/**
 * The note placed before the customer's unanswered messages when the bot is
 * forced to answer after a teammate stayed silent (teammate-wait). It only
 * says the team was alerted when the Telegram alert is switched on.
 */
export function formatAwaitingTeammateNote(
	minutesWaiting: number,
	teamAlerted = true,
): string {
	const intro = `The customer's messages below were written to a human teammate, who has not answered for ${minutesWaiting} minutes.`;
	return teamAlerted
		? `[Context Notice: ${intro} The team was alerted on Telegram. Answer what you can now, apologise for the wait, and tell the customer the team has been notified — do not claim a teammate is replying right now.]`
		: `[Context Notice: ${intro} Nobody has been told yet. Answer what you can now and apologise for the wait. If it still needs a person, escalate it first and only then say the team has been notified — do not claim a teammate is replying right now.]`;
}

/**
 * The note placed at the top of the history when older rows were cut from
 * the context (they stay in the DB). The model must not assume anything about
 * them. `nextAt` = when the first shown message (or the new request) came.
 */
export function formatDroppedHistoryNote(
	lastDroppedAt: Date,
	nextAt: Date,
): string {
	const ended = lastDroppedAt.toISOString().slice(0, 10);
	const gapMs = nextAt.getTime() - lastDroppedAt.getTime();
	const gap =
		gapMs >= 60 * 60_000
			? `, ${formatGapDuration(gapMs)} before the messages below`
			: "";
	return `[Context Notice: Older messages in this chat are not shown — the last of them was sent on ${ended}${gap}. Nothing from back then has been re-sent, so do not bring up older topics. If the customer refers to something from before (a payment, a receipt, a ticket), ask them for the details again.]`;
}

export interface HistoryGapSplit {
	/** Index of the first row of the current exchange. */
	index: number;
	gapMs: number;
	previousAt: Date;
}

/**
 * Locate the most recent pause of at least `thresholdMinutes` between
 * consecutive rows (or between the last row and `now`). Needs `createdAt` on
 * the rows; returns null when any row lacks it so callers can fall back to
 * the conversation-level timestamp.
 *
 * Splitting on real timestamps matters: the old heuristic put the gap before
 * the trailing run of user messages, which mis-filed unanswered messages
 * from the earlier exchange as part of the current one.
 */
export function findLastHistoryGap(
	rows: DbMessageRow[],
	thresholdMinutes: number,
	now: Date = new Date(),
): HistoryGapSplit | null {
	const thresholdMs = thresholdMinutes * 60_000;
	const last = rows[rows.length - 1];
	if (!last?.createdAt) {
		return null;
	}
	const tailGap = now.getTime() - last.createdAt.getTime();
	if (tailGap >= thresholdMs) {
		return {
			index: rows.length,
			gapMs: tailGap,
			previousAt: last.createdAt,
		};
	}
	for (let i = rows.length - 1; i >= 1; i--) {
		const current = rows[i]?.createdAt;
		const previous = rows[i - 1]?.createdAt;
		if (!current || !previous) {
			return null;
		}
		const gapMs = current.getTime() - previous.getTime();
		if (gapMs >= thresholdMs) {
			return { index: i, gapMs, previousAt: previous };
		}
	}
	return null;
}

export interface SelectHistoryWindowOptions {
	/** Pause length that earns a context notice; omit to skip pause detection. */
	thresholdMinutes?: number | undefined;
	now?: Date | undefined;
	staleMs?: number | undefined;
	maxAgeMs?: number | undefined;
}

export interface HistoryWindow {
	/** Rows to show the model, chronological. */
	rows: DbMessageRow[];
	/** Rows cut because a pause of at least `staleMs` followed them. */
	droppedStale: number;
	/** Rows cut afterwards by the `maxAgeMs` backstop. */
	droppedAge: number;
	/** `createdAt` of the newest cut row; null when nothing was cut. */
	lastDroppedAt: Date | null;
	/** Most recent pause ≥ thresholdMinutes within `rows` (or after the last one). */
	pause: HistoryGapSplit | null;
	/** The row right before `pause` is a human teammate's message. */
	pauseAfterTeammate: boolean;
}

/**
 * Decide which history rows the model sees. Returns null when any row lacks
 * `createdAt` (legacy callers fall back to the conversation timestamp).
 *
 * 1. Cut at the most recent pause of at least `staleMs` ANYWHERE in the rows
 *    — not just the newest pause. A chat with 36-day and 10-day silences
 *    followed by a 5-hour one used to keep all of it, and the bot asked the
 *    customer about a month-old transfer. If the newest row itself is that
 *    old, everything goes.
 * 2. Age backstop: drop whatever is still `maxAgeMs` old or older, for chats
 *    that never paused a full week.
 * 3. Find the latest ordinary pause (≥ thresholdMinutes) in what is left.
 */
export function selectHistoryWindow(
	rows: DbMessageRow[],
	options: SelectHistoryWindowOptions = {},
): HistoryWindow | null {
	const now = options.now ?? new Date();
	const staleMs = options.staleMs ?? STALE_HISTORY_MS;
	const maxAgeMs = options.maxAgeMs ?? MAX_HISTORY_AGE_MS;

	const times: number[] = [];
	for (const row of rows) {
		if (!row.createdAt) {
			return null;
		}
		times.push(row.createdAt.getTime());
	}
	const at = (i: number) => times[i] ?? 0;
	const nowMs = now.getTime();
	const count = rows.length;

	let staleCut = 0;
	if (count > 0 && nowMs - at(count - 1) >= staleMs) {
		staleCut = count;
	} else {
		for (let i = count - 1; i >= 1; i--) {
			if (at(i) - at(i - 1) >= staleMs) {
				staleCut = i;
				break;
			}
		}
	}

	let start = staleCut;
	while (start < count && nowMs - at(start) >= maxAgeMs) {
		start++;
	}

	const kept = rows.slice(start);
	const pause =
		options.thresholdMinutes === undefined
			? null
			: findLastHistoryGap(kept, options.thresholdMinutes, now);
	return {
		rows: kept,
		droppedStale: staleCut,
		droppedAge: start - staleCut,
		lastDroppedAt: rows[start - 1]?.createdAt ?? null,
		pause,
		pauseAfterTeammate:
			pause !== null && kept[pause.index - 1]?.role === "admin",
	};
}

function formatBeirutDateTime(value: Date): string {
	const { year, month, day, hour, minute } = beirutParts(value);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}`;
}

function formatGapDuration(ms: number): string {
	const totalMinutes = Math.floor(ms / 60_000);
	const hours = Math.floor(totalMinutes / 60);
	const days = Math.floor(hours / 24);
	const remainingHours = hours % 24;

	if (days > 0 && remainingHours > 0) {
		return `${days} day${days > 1 ? "s" : ""} and ${remainingHours} hour${remainingHours > 1 ? "s" : ""}`;
	}
	if (days > 0) {
		return `${days} day${days > 1 ? "s" : ""}`;
	}
	return `${hours} hour${hours > 1 ? "s" : ""}`;
}

/**
 * DB row shape — only the fields we need for history conversion. The full
 * `AiMessage` row may have many more columns; this is the strict subset
 * relied on here.
 */
export interface DbMessageRow {
	role: string; // "user" | "assistant" | "admin"
	content: string;
	toolCalls?: unknown; // Array<{ toolCallId?, toolName, args, result }>
	parts?: unknown; // UIMessage parts array (forward-compat column)
	attachmentType?: string | null; // "audio" | "image" | "video" | "document" | null
	/** Needed to split the history at real pauses; optional for legacy callers. */
	createdAt?: Date | null;
}

interface PersistedToolCall {
	toolCallId?: string;
	toolName: string;
	args?: unknown;
	result?: unknown;
}

/**
 * ISP search/diagnose tools whose `query` arg used to be forwarded directly
 * to iRadius `/user-info?mobile=X`. Before the May 2026 ASCII-only guard at
 * the tool boundary, non-ASCII (Arabic) queries hit iRadius' `User.Mobile
 * LIKE '%X%'` against a `latin1` column — UTF-8 bytes transcoded into
 * sequences that substring-matched unrelated phone numbers, returning the
 * wrong customer (most often `rolab` / "Rola hani Bahsoun"). Those bad
 * results are still stored on `ai_message.toolCalls` rows from long-running
 * conversations, so the LLM keeps recalling the bad username and reusing it
 * in subsequent turns — sidestepping the now-fixed input validation.
 *
 * Detecting the poison shape at history load time and overwriting the
 * persisted output with a "this was invalidated" note breaks that recall
 * loop without having to mutate the underlying DB rows.
 */
const POISON_PRONE_ISP_TOOL_IDS = new Set([
	"isp-search-customer",
	"isp-diagnose-customer",
	"isp-ping-customer",
	"isp-bandwidth-stats",
	"isp-mikrotik-users",
]);

const INVALIDATED_TOOL_OUTPUT =
	"[invalidated: ISP search no longer accepts non-ASCII queries; any customer identifiers in this prior result are unreliable and must NOT be reused. Re-identify the customer by their phone number or exact PPPoE/Hotspot username.]";

const ASCII_PRINTABLE_RE = /^[\x20-\x7e]*$/;

function isAsciiPrintable(value: string): boolean {
	return ASCII_PRINTABLE_RE.test(value);
}

function isPoisonedToolCall(call: PersistedToolCall): boolean {
	if (!POISON_PRONE_ISP_TOOL_IDS.has(call.toolName)) {
		return false;
	}
	const args = call.args;
	if (!args || typeof args !== "object") {
		return false;
	}
	const query = (args as { query?: unknown }).query;
	return (
		typeof query === "string" &&
		query.length > 0 &&
		!isAsciiPrintable(query)
	);
}

function isPersistedToolCallArray(
	value: unknown,
): value is PersistedToolCall[] {
	return (
		Array.isArray(value) &&
		value.every(
			(v) =>
				typeof v === "object" &&
				v !== null &&
				"toolName" in v &&
				typeof (v as Record<string, unknown>)["toolName"] === "string",
		)
	);
}

interface PersistedTextPart {
	type: "text";
	text: string;
}

interface PersistedToolPart {
	type: string; // `tool-${toolName}` or `dynamic-tool`
	toolCallId: string;
	toolName?: string;
	state?: string;
	input?: unknown;
	output?: unknown;
}

function isPersistedPart(
	value: unknown,
): value is PersistedTextPart | PersistedToolPart {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const t = (value as Record<string, unknown>)["type"];
	return typeof t === "string";
}

function isToolPart(
	part: PersistedTextPart | PersistedToolPart,
): part is PersistedToolPart {
	return part.type !== "text" && part.type.startsWith("tool-");
}

function toolNameFromPart(part: PersistedToolPart): string {
	return part.toolName ?? part.type.replace(/^tool-/, "");
}

function isPoisonedToolPart(part: PersistedToolPart): boolean {
	if (!POISON_PRONE_ISP_TOOL_IDS.has(toolNameFromPart(part))) {
		return false;
	}
	const args = part.input;
	if (!args || typeof args !== "object") {
		return false;
	}
	const query = (args as { query?: unknown }).query;
	return (
		typeof query === "string" &&
		query.length > 0 &&
		!isAsciiPrintable(query)
	);
}

/**
 * Convert a DB row into 1–2 ModelMessage entries.
 *
 * - user → 1 user ModelMessage
 * - assistant without tools → 1 assistant ModelMessage
 * - assistant with tools → 1 assistant ModelMessage (with tool-call parts) + 1 tool ModelMessage (with tool-result parts)
 * - admin (human takeover) → 1 assistant ModelMessage prefixed with a marker so the model
 *   can distinguish its own past output from a human teammate's input.
 *
 * IDs: AI SDK v6 requires `toolCallId` on both tool-call and tool-result parts.
 * If the persisted record doesn't have one (legacy data), we synthesize a
 * deterministic-ish ID so the call/result pair within a single message stays
 * matched.
 */
function assistantWithToolsToModelMessages(
	assistantText: string,
	calls: Array<{
		toolCallId: string;
		toolName: string;
		input: Record<string, unknown>;
		output: unknown;
	}>,
): ModelMessage[] {
	const assistantParts: Array<
		| { type: "text"; text: string }
		| {
				type: "tool-call";
				toolCallId: string;
				toolName: string;
				input: Record<string, unknown>;
		  }
	> = [];
	if (assistantText) {
		assistantParts.push({ type: "text", text: assistantText });
	}
	for (const c of calls) {
		assistantParts.push({
			type: "tool-call",
			toolCallId: c.toolCallId,
			toolName: c.toolName,
			input: c.input,
		});
	}

	const toolMessage: ModelMessage = {
		role: "tool",
		content: calls.map((c) => {
			const output = compactReplayedToolOutput(c.output);
			return {
				type: "tool-result",
				toolCallId: c.toolCallId,
				toolName: c.toolName,
				output:
					output === undefined
						? { type: "text", value: "" }
						: typeof output === "string"
							? { type: "text", value: output }
							: { type: "json", value: output as never },
			};
		}),
	};

	return [
		{ role: "assistant", content: assistantParts } as ModelMessage,
		toolMessage,
	];
}

/**
 * Replayed tool outputs dominate input-token cost: ISP diagnose/search
 * results are several KB of JSON, and with row-based history a 20-row window
 * replays them verbatim on EVERY turn (~10k input tokens measured in prod).
 * The model only needs the verdict from past turns — its own visible reply
 * already summarized the data — so large outputs are compacted to their
 * headline fields. The live generation loop is unaffected (this runs only on
 * history replay); the model can always re-run a tool for fresh details.
 */
const HISTORY_TOOL_OUTPUT_MAX_CHARS = 1200;
const COMPACT_KEEP_KEYS = [
	"success",
	"found",
	"message",
	"summary",
	"verdict",
	"connectionType",
	"peerSummary",
	"error",
] as const;

function compactReplayedToolOutput(output: unknown): unknown {
	if (typeof output === "string") {
		return output.length > HISTORY_TOOL_OUTPUT_MAX_CHARS
			? `${output.slice(0, HISTORY_TOOL_OUTPUT_MAX_CHARS)}… [truncated]`
			: output;
	}
	if (output === null || typeof output !== "object") {
		return output;
	}
	let json: string;
	try {
		json = JSON.stringify(output);
	} catch {
		return output;
	}
	if (json.length <= HISTORY_TOOL_OUTPUT_MAX_CHARS) {
		return output;
	}
	const obj = output as Record<string, unknown>;
	const kept: Record<string, unknown> = {};
	for (const key of COMPACT_KEEP_KEYS) {
		const value = obj[key];
		if (
			typeof value === "string" ||
			typeof value === "boolean" ||
			typeof value === "number"
		) {
			kept[key] = value;
		}
	}
	kept["note"] =
		"Full tool output elided from history to save context. Re-run the tool if you need current details.";
	return kept;
}

function partsToAssistantMessages(
	parts: unknown,
	fallbackContent: string,
	index: number,
): ModelMessage[] {
	if (!Array.isArray(parts)) {
		return [{ role: "assistant", content: fallbackContent }];
	}

	const valid = parts.filter(isPersistedPart);
	const textChunks: string[] = [];
	const toolCalls: Array<{
		toolCallId: string;
		toolName: string;
		input: Record<string, unknown>;
		output: unknown;
	}> = [];

	let toolIdx = 0;
	for (const part of valid) {
		if (part.type === "text") {
			textChunks.push((part as PersistedTextPart).text);
			continue;
		}
		if (!isToolPart(part)) {
			continue;
		}
		toolCalls.push({
			toolCallId: part.toolCallId ?? `call_${index}_${toolIdx}`,
			toolName: toolNameFromPart(part),
			input: (part.input ?? {}) as Record<string, unknown>,
			output: isPoisonedToolPart(part)
				? INVALIDATED_TOOL_OUTPUT
				: part.output,
		});
		toolIdx++;
	}

	const assistantText = textChunks.join("") || fallbackContent;

	if (toolCalls.length === 0) {
		return [{ role: "assistant", content: assistantText }];
	}

	return assistantWithToolsToModelMessages(assistantText, toolCalls);
}

function legacyToolCallsToAssistantMessages(
	toolCalls: PersistedToolCall[],
	content: string,
	index: number,
): ModelMessage[] {
	const callsWithIds = toolCalls.map((tc, i) => ({
		toolCallId: tc.toolCallId ?? `call_${index}_${i}`,
		toolName: tc.toolName,
		input: (tc.args ?? {}) as Record<string, unknown>,
		output: isPoisonedToolCall(tc) ? INVALIDATED_TOOL_OUTPUT : tc.result,
	}));
	return assistantWithToolsToModelMessages(content, callsWithIds);
}

function describeAdminMedia(attachmentType: string): string {
	switch (attachmentType) {
		case "audio":
		case "voice":
			return "voice note sent by the human team";
		case "image":
			return "image sent by the human team";
		case "video":
			return "video sent by the human team";
		case "document":
			return "document sent by the human team";
		case "contact":
			return "shared a contact card";
		case "location":
			return "shared a location pin";
		default:
			return `${attachmentType} sent by the human team`;
	}
}

/**
 * Admin media rows store either the transcript / image description (the
 * usual case — 1,900+ voice rows on prod) or a bare placeholder written
 * before transcription existed or when it failed.
 */
const MEDIA_PLACEHOLDER_RE =
	/^\s*(?:\[(?:voice message|image|video|document|audio) received\]|voice note|image|video|document|audio)?\s*$/i;

export function isMediaPlaceholder(content: string): boolean {
	return MEDIA_PLACEHOLDER_RE.test(content);
}

function rowToModelMessages(row: DbMessageRow, index: number): ModelMessage[] {
	const role = row.role;

	if (role === "user") {
		return [{ role: "user", content: row.content }];
	}

	// Admin replies (human teammate took over via WhatsApp/Telegram) — surface
	// them as assistant messages but prefix so the model knows it's not its own
	// past output.
	if (role === "admin") {
		// Media attachments (audio/image/video) carry a placeholder string like
		// "Voice note" or "[Voice message received]" in `content` and the real
		// payload in `attachmentUrl`. The model has no access to that payload —
		// emitting the placeholder as a normal assistant turn leaves it with no
		// anchor and it confabulates the customer's next line.
		if (row.attachmentType) {
			const mediaLabel = describeAdminMedia(row.attachmentType);
			if (isMediaPlaceholder(row.content)) {
				return [
					{
						role: "assistant",
						content: `[Human teammate reply — ${mediaLabel}. Content is not visible to you. Do not impersonate the customer or guess what was said; wait for the customer's next message.]`,
					},
				];
			}
			// Transcribed voice note / described image: give the model what
			// the teammate actually said, marked as theirs. Contact cards and
			// location pins carry their data verbatim — nothing was transcribed.
			const transcribed =
				row.attachmentType === "contact" ||
				row.attachmentType === "location"
					? ""
					: ", transcribed";
			return [
				{
					role: "assistant",
					content: `[Human teammate reply — ${mediaLabel}${transcribed}]\n${row.content}`,
				},
			];
		}
		const prefixed = `[Human teammate reply]\n${row.content}`;
		return [{ role: "assistant", content: prefixed }];
	}

	if (role !== "assistant") {
		return [{ role: "user", content: row.content }];
	}

	// Prefer canonical `parts` column when present (new writes use parts only).
	if (Array.isArray(row.parts) && row.parts.length > 0) {
		return partsToAssistantMessages(row.parts, row.content, index);
	}

	// Legacy fallback for rows written before the parts migration. Removed in
	// the follow-up cleanup deploy once backfill has populated `parts`.
	const legacy = isPersistedToolCallArray(row.toolCalls) ? row.toolCalls : [];
	if (legacy.length === 0) {
		return [{ role: "assistant", content: row.content }];
	}
	return legacyToolCallsToAssistantMessages(legacy, row.content, index);
}

/**
 * Convert an array of DB rows (already in chronological order) into a flat
 * sequence of ModelMessage that can be fed directly to streamText/generateText.
 *
 * AI SDK v6 validates that every tool-call has a matching tool-result, so
 * this function always pairs them. If a stored tool call is missing a result,
 * we still emit an empty result to keep the conversation valid — losing some
 * fidelity but avoiding `MissingToolResultsError`.
 */
export function dbMessagesToModelMessages(
	rows: DbMessageRow[],
): ModelMessage[] {
	const out: ModelMessage[] = [];
	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		if (!row) {
			continue;
		}
		out.push(...rowToModelMessages(row, i));
	}
	return out;
}

/**
 * Build a canonical UIMessage `parts` array for persisting an assistant
 * message. `text` is rendered as a single text part; each `ToolResult` becomes
 * a `tool-<name>` part in the `output-available` state. The shape matches what
 * `streamText().toUIMessageStreamResponse()` writes via its `onFinish`
 * callback, so streaming and non-streaming code paths produce the same DB
 * layout.
 */
export function assistantMessageToParts(
	text: string,
	toolResults: ToolResult[] | undefined,
): UIMessage["parts"] {
	const parts: UIMessage["parts"] = [];
	if (text) {
		parts.push({ type: "text", text });
	}
	for (const tr of toolResults ?? []) {
		parts.push({
			type: `tool-${tr.toolName}`,
			toolCallId: tr.toolCallId ?? `gen_${crypto.randomUUID()}`,
			state: "output-available",
			input: toJsonSafe(tr.args ?? {}),
			output: toJsonSafe(tr.result),
		} as UIMessage["parts"][number]);
	}
	return parts;
}

/**
 * Make a tool input/output safe for Prisma JSON columns. Tool inputs can
 * carry explicit `undefined` object values (e.g. the escalation guard passes
 * `customerName: undefined`), which Prisma's strictUndefinedChecks rejects at
 * persist time — losing the whole assistant message. JSON round-trip drops
 * undefined values and anything else non-serializable.
 */
function toJsonSafe(value: unknown): unknown {
	if (value === undefined) {
		return null;
	}
	try {
		return JSON.parse(JSON.stringify(value));
	} catch {
		return null;
	}
}

/**
 * Convert a legacy `(content, toolCalls)` row into a canonical UIMessage parts
 * array. Used both by the backfill script and by API read paths that still
 * need to render rows persisted before the parts migration. Once backfill has
 * completed and the `toolCalls` column is dropped, the call sites that wrap a
 * row's content+toolCalls in this function go away.
 */
export function legacyRowToParts(
	content: string,
	toolCalls: unknown,
): UIMessage["parts"] {
	if (!Array.isArray(toolCalls)) {
		return assistantMessageToParts(content, undefined);
	}
	const toolResults: ToolResult[] = [];
	for (const tc of toolCalls) {
		if (typeof tc !== "object" || tc === null) {
			continue;
		}
		const t = tc as Record<string, unknown>;
		if (typeof t["toolName"] !== "string") {
			continue;
		}
		toolResults.push({
			toolCallId:
				typeof t["toolCallId"] === "string"
					? t["toolCallId"]
					: undefined,
			toolName: t["toolName"] as string,
			args: t["args"],
			result: t["result"],
		});
	}
	return assistantMessageToParts(content, toolResults);
}

const TEAMMATE_MARKER = "[Human teammate reply";

/**
 * Flatten ModelMessage[] into {role, content}[] for the escalation guard /
 * summarizer LLMs. Tool messages are dropped; assistant tool-call parts are
 * rendered as `[called <toolName>]` markers so the summarizer sees what
 * actions the agent took.
 *
 * Injected `[Context Notice …]` notes are not customer messages and are
 * stripped (any customer text after the note is kept). A human teammate's replay row comes back as role `admin` with the
 * marker line stripped, so the summary does not credit the bot with it.
 */
export function modelMessagesToRoleContent(
	messages: ModelMessage[],
): Array<{ role: string; content: string }> {
	const out: Array<{ role: string; content: string }> = [];
	for (const m of messages) {
		if (m.role !== "user" && m.role !== "assistant") {
			continue;
		}
		if (
			typeof m.content === "string" &&
			m.role === "user" &&
			m.content.startsWith("[Context Notice")
		) {
			// A notice can still carry customer text after it (a caller that
			// merged it into the next turn): keep that text.
			const rest = stripInternalMarkers(m.content);
			if (rest) {
				out.push({ role: "user", content: rest });
			}
			continue;
		}
		if (
			typeof m.content === "string" &&
			m.role === "assistant" &&
			m.content.startsWith(TEAMMATE_MARKER)
		) {
			const newline = m.content.indexOf("\n");
			out.push({
				role: "admin",
				content:
					newline === -1
						? "[media sent by the team]"
						: m.content.slice(newline + 1),
			});
			continue;
		}
		const content =
			typeof m.content === "string"
				? m.content
				: m.content
						.map((p) => {
							if (p.type === "text") {
								return p.text;
							}
							if (p.type === "tool-call") {
								return `[called ${p.toolName}]`;
							}
							return "";
						})
						.filter(Boolean)
						.join(" ");
		if (content) {
			out.push({ role: m.role, content });
		}
	}
	return out;
}
