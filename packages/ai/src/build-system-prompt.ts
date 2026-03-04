import {
	DEFAULT_PROMPT_SECTIONS,
	type PromptSection,
} from "./default-prompt-sections";
import { getToolRegistry } from "./tools";

export interface BuildSystemPromptOptions {
	basePrompt: string;
	enabledTools: string[];
	knowledgeBase?: string | undefined;
	contactName?: string | undefined;
	contactPhone?: string | undefined;
	maintenanceMode?: boolean | undefined;
	maintenanceMessage?: string | undefined;
	/** Provider name for contact info section (e.g. "whatsapp", "telegram") */
	provider?: string | undefined;
	/** Web chat doesn't need verbose tool narration */
	isWebChat?: boolean | undefined;
	/** Agent-level configurable prompt sections (from DB). Empty array = use defaults. */
	promptSections?: PromptSection[] | undefined;
	/** Per-tool prompt overrides keyed by toolId (from AiAgentToolConfig.promptSection). */
	toolPromptOverrides?: Record<string, string | null> | undefined;
}

export function buildSystemPrompt(opts: BuildSystemPromptOptions): string {
	const sections: string[] = [];

	// Maintenance mode: override the entire prompt personality
	if (opts.maintenanceMode) {
		sections.push(
			maintenanceSystemPrompt(
				opts.basePrompt,
				opts.maintenanceMessage ?? undefined,
			),
		);
	} else {
		sections.push(opts.basePrompt);
	}

	// Contact info (dynamic runtime data — stays in code)
	if (opts.contactName || opts.contactPhone) {
		sections.push(contactInfoSection(opts));
	}

	// Tool-owned prompt sections — for each enabled tool, include its prompt
	const registry = getToolRegistry();
	for (const toolId of opts.enabledTools) {
		const registered = registry[toolId];
		if (!registered) {
			continue;
		}

		// Use override if provided, fall back to tool's default
		if (opts.toolPromptOverrides && toolId in opts.toolPromptOverrides) {
			const override = opts.toolPromptOverrides[toolId];
			// Non-empty override = use it; null/empty = intentionally cleared
			if (override) {
				sections.push(override);
			}
		} else if (registered.defaultPromptSection) {
			sections.push(registered.defaultPromptSection);
		}
	}

	// Agent-level prompt sections (configurable, with condition evaluation)
	const agentSections =
		opts.promptSections && opts.promptSections.length > 0
			? opts.promptSections
			: DEFAULT_PROMPT_SECTIONS;

	const hasTools = opts.enabledTools.length > 0;

	for (const section of agentSections) {
		if (!section.enabled) {
			continue;
		}

		if (!evaluateCondition(section.condition, hasTools, opts.isWebChat)) {
			continue;
		}

		sections.push(section.content);
	}

	return sections.join("\n\n");
}

/**
 * Extract tool prompt overrides from per-tool configs (AiAgentToolConfig rows).
 * Returns a map of toolId -> promptSection for passing to buildSystemPrompt.
 */
export function extractToolPromptOverrides(
	toolConfigs: Array<{ toolId: string; promptSection?: string | null }>,
): Record<string, string | null> {
	const overrides: Record<string, string | null> = {};
	for (const tc of toolConfigs) {
		if (tc.promptSection !== undefined && tc.promptSection !== null) {
			overrides[tc.toolId] = tc.promptSection;
		}
	}
	return overrides;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function evaluateCondition(
	condition: PromptSection["condition"],
	hasTools: boolean,
	isWebChat?: boolean | undefined,
): boolean {
	switch (condition) {
		case "always":
			return true;
		case "has-tools":
			return hasTools;
		case "has-tools-non-webchat":
			return hasTools && !isWebChat;
		default:
			// No condition = always include
			return true;
	}
}

function maintenanceSystemPrompt(
	basePrompt: string,
	message?: string | undefined,
): string {
	const context = message
		? `\n\nAdmin context about the current issue (internal — do NOT repeat verbatim to customers): "${message}"`
		: "";

	return (
		`MAINTENANCE MODE IS ACTIVE — THIS OVERRIDES YOUR NORMAL BEHAVIOR.${context}\n\n` +
		"MAINTENANCE MODE RULES (follow strictly in order):\n" +
		"1. When a customer reports ANY connectivity issue (slow internet, disconnection, no signal, etc.), " +
		"your FIRST response MUST acknowledge the known service issue. Explain it empathetically in your own words. " +
		"Do NOT run diagnostics or tools first — lead with the known issue.\n" +
		"2. Do NOT repeat the admin context message word-for-word. Rephrase it naturally.\n" +
		"3. If the admin context includes an estimated resolution time, share it. Otherwise, do not speculate on timing.\n" +
		"4. ONLY run diagnostic tools if the customer explicitly asks for deeper investigation after you've informed them, " +
		"or if you need to verify their account for a specific request.\n" +
		"5. If a customer asks about something clearly unrelated to the known issue (e.g. billing, new subscription), help them normally.\n" +
		"6. Stay calm, professional, and reassuring.\n\n" +
		`Your base personality and identity:\n${basePrompt}`
	);
}

function contactInfoSection(opts: BuildSystemPromptOptions): string {
	const parts: string[] = [];
	if (opts.contactName) {
		parts.push(`name: ${opts.contactName}`);
	}
	if (opts.contactPhone) {
		parts.push(`phone: ${opts.contactPhone}`);
	}
	const provider = opts.provider ?? "messaging";
	return (
		`CUSTOMER CONTACT INFO (from their ${provider} account): ${parts.join(", ")}. ` +
		"You already have this — do NOT ask for it from scratch. " +
		`Confirm naturally (e.g. "I see your number is ${opts.contactPhone ?? "..."}, is that correct?"). ` +
		"Use it for account lookups, escalations, sales leads, and any situation requiring the customer's identity. " +
		"If the customer provides a DIFFERENT phone number or name, use that instead."
	);
}
