import type { ModelMessage, UIMessage } from "ai";
import type { ToolResult } from "./types";

/**
 * Builds a context gap note to inject into message history when there's been
 * a significant time gap between messages. Returns null if no gap or below threshold.
 */
export function buildContextGapNote(
	lastMessageAt: Date | null,
	thresholdMinutes: number,
): string | null {
	if (!lastMessageAt) {
		return null;
	}

	const gapMs = Date.now() - lastMessageAt.getTime();
	const gapMinutes = gapMs / 60_000;

	if (gapMinutes < thresholdMinutes) {
		return null;
	}

	const duration = formatGapDuration(gapMs);
	return `[Context Notice: ${duration} have passed since the last message. The customer may be following up or raising a new issue. Do not assume continuity — let their message guide you.]`;
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
		content: calls.map((c) => ({
			type: "tool-result",
			toolCallId: c.toolCallId,
			toolName: c.toolName,
			output:
				c.output === undefined
					? { type: "text", value: "" }
					: typeof c.output === "string"
						? { type: "text", value: c.output }
						: { type: "json", value: c.output as never },
		})),
	};

	return [
		{ role: "assistant", content: assistantParts } as ModelMessage,
		toolMessage,
	];
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

function rowToModelMessages(row: DbMessageRow, index: number): ModelMessage[] {
	const role = row.role;

	if (role === "user") {
		return [{ role: "user", content: row.content }];
	}

	// Admin replies (human teammate took over via WhatsApp/Telegram) — surface
	// them as assistant messages but prefix so the model knows it's not its own
	// past output.
	if (role === "admin") {
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
			input: tr.args ?? {},
			output: tr.result,
		} as UIMessage["parts"][number]);
	}
	return parts;
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

/**
 * Flatten ModelMessage[] into {role, content}[] for the escalation guard /
 * summarizer LLMs. Tool messages are dropped; assistant tool-call parts are
 * rendered as `[called <toolName>]` markers so the summarizer sees what
 * actions the agent took.
 */
export function modelMessagesToRoleContent(
	messages: ModelMessage[],
): Array<{ role: string; content: string }> {
	const out: Array<{ role: string; content: string }> = [];
	for (const m of messages) {
		if (m.role !== "user" && m.role !== "assistant") {
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
