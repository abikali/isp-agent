export interface AiModelOption {
	id: string;
	label: string;
	provider: string;
	/** Price per million input tokens (USD) */
	priceIn: number;
	/** Price per million output tokens (USD) */
	priceOut: number;
	recommended?: boolean;
}

export const AI_MODEL_GROUPS: { label: string; models: AiModelOption[] }[] = [
	{
		label: "Google",
		models: [
			{
				id: "gemini-2.5-pro",
				label: "Gemini 2.5 Pro",
				provider: "google",
				priceIn: 1.25,
				priceOut: 10,
				recommended: true,
			},
			{
				id: "gemini-3-flash",
				label: "Gemini 3 Flash",
				provider: "google",
				priceIn: 0.5,
				priceOut: 3,
				recommended: true,
			},
			{
				id: "gemini-3.1-flash-lite",
				label: "Gemini 3.1 Flash Lite",
				provider: "google",
				priceIn: 0.25,
				priceOut: 1.5,
				recommended: true,
			},
			{
				id: "gemini-2.5-flash",
				label: "Gemini 2.5 Flash",
				provider: "google",
				priceIn: 0.3,
				priceOut: 2.5,
			},
			{
				id: "gemini-2.5-flash-lite",
				label: "Gemini 2.5 Flash Lite",
				provider: "google",
				priceIn: 0.1,
				priceOut: 0.4,
			},
		],
	},
	{
		label: "OpenAI",
		models: [
			{
				id: "gpt-4.1",
				label: "GPT-4.1",
				provider: "openai",
				priceIn: 2,
				priceOut: 8,
			},
			{
				id: "gpt-5.2",
				label: "GPT-5.2",
				provider: "openai",
				priceIn: 1.75,
				priceOut: 14,
			},
			{
				id: "gpt-4.1-mini",
				label: "GPT-4.1 Mini",
				provider: "openai",
				priceIn: 0.4,
				priceOut: 1.6,
			},
			{
				id: "gpt-4o",
				label: "GPT-4o",
				provider: "openai",
				priceIn: 2.5,
				priceOut: 10,
			},
			{
				id: "gpt-4.1-nano",
				label: "GPT-4.1 Nano",
				provider: "openai",
				priceIn: 0.1,
				priceOut: 0.4,
			},
			{
				id: "gpt-4o-mini",
				label: "GPT-4o Mini",
				provider: "openai",
				priceIn: 0.15,
				priceOut: 0.6,
			},
		],
	},
	{
		label: "Anthropic",
		models: [
			{
				id: "claude-sonnet",
				label: "Claude Sonnet 4",
				provider: "anthropic",
				priceIn: 3,
				priceOut: 15,
			},
		],
	},
	{
		label: "Mistral",
		models: [
			{
				id: "mistral-large",
				label: "Mistral Large 3",
				provider: "mistral",
				priceIn: 0.5,
				priceOut: 1.5,
			},
			{
				id: "mistral-medium",
				label: "Mistral Medium 3.1",
				provider: "mistral",
				priceIn: 0.4,
				priceOut: 2,
			},
		],
	},
	{
		label: "Qwen",
		models: [
			{
				id: "qwen-3.5",
				label: "Qwen 3.5 397B",
				provider: "qwen",
				priceIn: 0.39,
				priceOut: 2.34,
			},
		],
	},
	{
		label: "DeepSeek",
		models: [
			{
				id: "deepseek-v3",
				label: "DeepSeek V3.2",
				provider: "deepseek",
				priceIn: 0.25,
				priceOut: 0.4,
			},
		],
	},
];

/** Flat list for backward compatibility */
export const AI_MODEL_OPTIONS = AI_MODEL_GROUPS.flatMap((g) => g.models);

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
