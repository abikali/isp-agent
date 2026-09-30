import { generateText, Output } from "ai";
import { z } from "zod";
import { stripInternalMarkers } from "./chat-formatting";
import {
	getModel,
	helperModelId,
	type ModelCredentials,
} from "./model-registry";

/**
 * "What the bot said and what was concluded" — one summary per idle-bounded
 * episode of a conversation, for the team's Telegram and the customer page.
 */

export const CONVERSATION_OUTCOMES = [
	"resolved",
	"escalated",
	"waiting_customer",
	"waiting_team",
	"sales_lead",
	"info_only",
	"unresolved",
	"abandoned",
] as const;

export type ConversationOutcome = (typeof CONVERSATION_OUTCOMES)[number];

export const conversationSummarySchema = z.object({
	outcome: z
		.enum(CONVERSATION_OUTCOMES)
		.describe(
			"resolved = the customer's issue or question was answered/fixed. escalated = handed to the team. waiting_customer = the bot is waiting for something from the customer. waiting_team = the customer is waiting for the team (promised call/visit). sales_lead = new subscription/upgrade interest. info_only = a simple information exchange. unresolved = ended without a fix or a handoff. abandoned = the customer stopped answering mid-way.",
		),
	customerMood: z
		.enum(["satisfied", "neutral", "upset"])
		.describe("The customer's mood at the END of the episode."),
	summary: z
		.string()
		.describe(
			"2-4 sentences in English: what the customer wanted, what happened, and how it ended.",
		),
	botActions: z
		.string()
		.nullable()
		.describe(
			"One line of what the bot actually did with its tools, e.g. 'Ran diagnose (online, AP ok); listed 2 unpaid invoices; escalated to team'. null when it used no tools.",
		),
	openItems: z
		.string()
		.nullable()
		.describe(
			"What is still pending and on whom (customer or team). null when nothing is pending.",
		),
});

export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

/** A stored `ai_message` row, as the summary needs it. */
export interface EpisodeRow {
	role: string;
	content: string;
	parts?: unknown;
	isFollowUp?: boolean | null;
	createdAt?: Date | null;
}

const MAX_ROWS = 40;
const TOOL_RESULT_CHARS = 200;

function toolLines(parts: unknown): string[] {
	if (!Array.isArray(parts)) {
		return [];
	}
	const lines: string[] = [];
	for (const part of parts) {
		if (!part || typeof part !== "object") {
			continue;
		}
		const p = part as {
			type?: unknown;
			toolName?: unknown;
			output?: unknown;
		};
		if (typeof p.type !== "string" || !p.type.startsWith("tool-")) {
			continue;
		}
		const name =
			typeof p.toolName === "string"
				? p.toolName
				: p.type.replace(/^tool-/, "");
		let result: string;
		try {
			result =
				typeof p.output === "string"
					? p.output
					: JSON.stringify(p.output ?? null);
		} catch {
			result = "";
		}
		lines.push(`[Tool ${name}: ${result.slice(0, TOOL_RESULT_CHARS)}]`);
	}
	return lines;
}

/**
 * The transcript the summariser reads: `Customer:` / `Agent:` / `Team:`
 * lines, one `[Tool …]` line per tool call, internal markers stripped, the
 * last 40 rows only.
 */
export function buildEpisodeTranscript(rows: EpisodeRow[]): string {
	const lines: string[] = [];
	for (const row of rows.slice(-MAX_ROWS)) {
		const text = stripInternalMarkers(row.content ?? "");
		const label =
			row.role === "user"
				? "Customer"
				: row.role === "admin"
					? "Team"
					: "Agent";
		if (row.role === "assistant") {
			lines.push(...toolLines(row.parts));
		}
		if (text) {
			const suffix = row.isFollowUp ? " (automatic follow-up)" : "";
			lines.push(`${label}${suffix}: ${text}`);
		}
	}
	return lines.join("\n");
}

/**
 * Worth a summary: a real exchange (≥2 customer messages and ≥1 bot reply
 * that is not an automatic nudge), or an escalation happened in the window.
 */
export function isSubstantiveEpisode(
	rows: EpisodeRow[],
	escalated = false,
): boolean {
	if (escalated) {
		return true;
	}
	let user = 0;
	let bot = 0;
	for (const row of rows) {
		if (row.role === "user") {
			user++;
		} else if (row.role === "assistant" && !row.isFollowUp) {
			bot++;
		}
	}
	return user >= 2 && bot >= 1;
}

const SYSTEM_PROMPT = `You summarise one episode of a WhatsApp conversation between an ISP customer and the ISP's AI support agent, for the support team's manager. Lines marked "Team" are a human teammate. "[Tool …]" lines are what the agent's tools returned.

Rules:
- Write in English, whatever language the conversation is in (Lebanese Arabic, Arabizi, English, French).
- "summary": 2-4 short sentences — what the customer wanted, what the agent found or did, and how it ended.
- "botActions": what the agent concretely did with tools, in one line; null if it used none.
- "openItems": what is still pending and who owes the next step; null if nothing.
- Never repeat PINs, passwords or card numbers, even if they appear in the conversation.
- Do not quote the transcript; paraphrase.`;

interface SummarizeEpisodeInput {
	credentials: ModelCredentials;
	rows: EpisodeRow[];
	customerName?: string | null | undefined;
	customerUsername?: string | null | undefined;
	escalated: boolean;
}

/**
 * Summarise one episode. Uses the "mini" helper (Lebanese Arabic input
 * quality matters; about five calls a day). Returns null on any failure.
 */
export async function summarizeConversationEpisode(
	input: SummarizeEpisodeInput,
): Promise<{ summary: ConversationSummary; model: string } | null> {
	const model = helperModelId(input.credentials.provider, "mini");
	const abortController = new AbortController();
	const timer = setTimeout(() => abortController.abort(), 20_000);

	try {
		let userPrompt = `Customer: ${input.customerName ?? "Unknown customer"}`;
		if (input.customerUsername) {
			userPrompt += ` (username ${input.customerUsername})`;
		}
		if (input.escalated) {
			userPrompt += "\nThe agent escalated this episode to the team.";
		}
		userPrompt += `\n\nConversation:\n${buildEpisodeTranscript(input.rows)}\n\nRespond in JSON.`;

		const result = await generateText({
			model: getModel(model, input.credentials),
			system: SYSTEM_PROMPT,
			messages: [{ role: "user", content: userPrompt }],
			output: Output.object({ schema: conversationSummarySchema }),
			temperature: 0,
			abortSignal: abortController.signal,
		});

		// biome-ignore lint/suspicious/noConsole: logger from @repo/logs breaks client bundle (Rollup can't resolve it)
		console.info("helper-llm-usage", {
			fn: "summarizeConversationEpisode",
			model,
			inputTokens: result.usage?.inputTokens ?? 0,
			outputTokens: result.usage?.outputTokens ?? 0,
		});

		const summary = (result.output ?? null) as ConversationSummary | null;
		return summary ? { summary, model } : null;
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}
