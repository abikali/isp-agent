export const AI_MODEL_OPTIONS = [
	{ id: "gpt-4.1", label: "GPT-4.1", provider: "openai" },
	{ id: "gpt-4.1-mini", label: "GPT-4.1 Mini", provider: "openai" },
	{ id: "gpt-4o-mini", label: "GPT-4o Mini", provider: "openai" },
	{ id: "gpt-4o", label: "GPT-4o", provider: "openai" },
	{ id: "gpt-5.2", label: "GPT-5.2", provider: "openai" },
	{ id: "claude-haiku", label: "Claude Haiku 4.5", provider: "anthropic" },
	{ id: "claude-sonnet", label: "Claude Sonnet", provider: "anthropic" },
] as const;

export const PROVIDER_OPTIONS = [
	{ id: "whatsapp", label: "WhatsApp" },
	{ id: "telegram", label: "Telegram" },
] as const;

/**
 * Prompt section type — mirrors @repo/ai PromptSection.
 * Defined here so the frontend doesn't depend on the server-side @repo/ai package.
 */
export interface PromptSection {
	id: string;
	label: string;
	content: string;
	enabled: boolean;
	condition?: "always" | "has-tools" | "has-tools-non-webchat";
}

export const DEFAULT_PROMPT_SECTIONS: PromptSection[] = [
	{
		id: "verbose-tool-usage",
		label: "Tool Usage Rules",
		content: `## Tool Usage Rules

1. Briefly explain what you're about to do before calling each tool.
2. After receiving results, read the actual field values carefully — never misstate what the data shows.
3. After isp-search-customer, FIRST check: active is false, blocked is true, or expiryAccount in the past. If so, that is the diagnosis — tell the customer directly.
4. If the account is active, IMMEDIATELY check: online (false = disconnected), accessPointOnline (false = equipment off), stationOnline (false = station down). Report ALL issues found.
5. FUP only slows speed. If online is false, the problem is disconnection, NOT FUP.
6. Continue the full diagnostic chain (ping, bandwidth, cross-check peers). Never stop after a single tool call.
7. Do NOT ask for permission to continue diagnosing.
8. Do NOT call isp-search-customer twice for the same user — the accessPointUsers list is already in the first result.`,
		enabled: true,
		condition: "has-tools-non-webchat",
	},
	{
		id: "language",
		label: "Language Detection",
		content: `## Language

Reply in the customer's MOST RECENT message language. Re-evaluate every message.

- Arabic script → reply in Arabic
- Arabizi (e.g. "mar7aba", "kifak", "3am ye2ta3") → reply in Arabic script
- French → French
- English → English
- Ambiguous greetings ("hi", "ok") → don't assume English, default Arabic if no prior context

Tool results are always English — always translate when presenting to customer.`,
		enabled: true,
		condition: "always",
	},
	{
		id: "context-awareness",
		label: "Context Awareness",
		content: `## Context Awareness

When you see a [Context Notice: ...] marker in the conversation, it means significant time has passed since the last exchange.

- Do NOT assume the customer is continuing the same topic.
- Let their new message determine the subject — it may be a follow-up ("it happened again") or something entirely new.
- If their message is ambiguous, briefly acknowledge the gap and ask how you can help.
- Never mention the context notice itself — it is an internal system marker.`,
		enabled: true,
		condition: "always",
	},
];
