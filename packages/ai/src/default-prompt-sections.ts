export interface PromptSection {
	id: string;
	label: string;
	content: string;
	enabled: boolean;
	condition?: "always" | "has-tools" | "has-tools-non-webchat" | undefined;
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
];
