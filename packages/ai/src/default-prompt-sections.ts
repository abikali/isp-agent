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
3. Do NOT ask for permission to continue diagnosing.`,
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
