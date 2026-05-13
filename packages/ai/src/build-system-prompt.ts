import {
	DEFAULT_PROMPT_SECTIONS,
	type PromptSection,
} from "./default-prompt-sections";
import { getToolRegistry } from "./tools";

export interface VerifiedCustomerSummary {
	fullName?: string | undefined;
	username?: string | undefined;
	accountNumber?: string | undefined;
	status?: string | undefined;
	planName?: string | undefined;
}

export interface BuildSystemPromptOptions {
	basePrompt: string;
	enabledTools: string[];
	knowledgeBase?: string | undefined;
	contactName?: string | undefined;
	contactPhone?: string | undefined;
	/**
	 * The ISP customer this conversation has been linked to (auto-resolved
	 * from the messaging provider's phone). When set, the agent renders a
	 * stronger identity section with a concrete `username` the model can
	 * pass directly to ISP tools — no search step required.
	 */
	verifiedCustomer?: VerifiedCustomerSummary | undefined;
	maintenanceMode?: boolean | undefined;
	maintenanceMessage?: string | undefined;
	/** Provider name for contact info section (e.g. "whatsapp", "telegram") */
	provider?: string | undefined;
	/** Web chat doesn't need verbose tool narration */
	isWebChat?: boolean | undefined;
	/** Pre-formatted service plans section to inject into the prompt. */
	servicePlans?: string | undefined;
	/** Agent-level configurable prompt sections (from DB). Empty array = use defaults. */
	promptSections?: PromptSection[] | undefined;
	/** Per-tool prompt overrides keyed by toolId (from AiAgentToolConfig.promptSection). */
	toolPromptOverrides?: Record<string, string | null> | undefined;
}

/**
 * Cacheable system content (agent personality, tool prompts, service plans,
 * generic instructions) vs. per-conversation dynamic content (customer info,
 * maintenance mode message).
 *
 * Splitting these lets the caller stamp a `cacheControl: { type: 'ephemeral' }`
 * breakpoint on the static section. For Anthropic via OpenRouter that yields
 * a ~90% input-token discount on cache hits, with a 5-minute (or 1-hour) TTL.
 *
 * The order is deliberate: static sections go first so they share a stable
 * prefix; the dynamic block is appended after the breakpoint.
 */
export interface SystemPromptParts {
	/** Stable across the conversation — safe to mark cacheable. */
	staticPrompt: string;
	/** Per-conversation context that should NOT be cached. */
	dynamicPrompt: string;
}

export function buildSystemPromptParts(
	opts: BuildSystemPromptOptions,
): SystemPromptParts {
	const staticSections: string[] = [];
	const dynamicSections: string[] = [];

	// Maintenance mode WRAPS the base personality with extra rules; the
	// `maintenanceMessage` itself (the admin context string) is dynamic and
	// goes into the dynamic block below.
	if (opts.maintenanceMode) {
		staticSections.push(maintenanceSystemPrompt(opts.basePrompt));
	} else {
		staticSections.push(opts.basePrompt);
	}

	if (opts.servicePlans) {
		staticSections.push(opts.servicePlans);
	}

	const registry = getToolRegistry();
	for (const toolId of opts.enabledTools) {
		const registered = registry[toolId];
		if (!registered) {
			continue;
		}
		if (opts.toolPromptOverrides && toolId in opts.toolPromptOverrides) {
			const override = opts.toolPromptOverrides[toolId];
			if (override) {
				staticSections.push(override);
			}
		} else if (registered.defaultPromptSection) {
			staticSections.push(registered.defaultPromptSection);
		}
	}

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
		staticSections.push(section.content);
	}

	if (opts.maintenanceMode && opts.maintenanceMessage) {
		dynamicSections.push(
			`Admin context about the current issue (internal — do NOT repeat verbatim to customers): "${opts.maintenanceMessage}"`,
		);
	}

	if (opts.verifiedCustomer) {
		dynamicSections.push(verifiedCustomerSection(opts));
	} else if (opts.contactName || opts.contactPhone) {
		dynamicSections.push(contactInfoSection(opts));
	}

	return {
		staticPrompt: staticSections.join("\n\n"),
		dynamicPrompt: dynamicSections.join("\n\n"),
	};
}

/**
 * Backwards-compatible helper that joins `staticPrompt` + `dynamicPrompt` into
 * a single string. New code that wants prompt caching should call
 * `buildSystemPromptParts` instead.
 */
export function buildSystemPrompt(opts: BuildSystemPromptOptions): string {
	const { staticPrompt, dynamicPrompt } = buildSystemPromptParts(opts);
	if (!dynamicPrompt) {
		return staticPrompt;
	}
	return `${staticPrompt}\n\n${dynamicPrompt}`;
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
			return true;
	}
}

function maintenanceSystemPrompt(basePrompt: string): string {
	return (
		"MAINTENANCE MODE IS ACTIVE — THIS OVERRIDES YOUR NORMAL BEHAVIOR.\n\n" +
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

function verifiedCustomerSection(opts: BuildSystemPromptOptions): string {
	const customer = opts.verifiedCustomer;
	if (!customer) {
		return "";
	}
	const provider = opts.provider ?? "messaging";
	const facts: string[] = [];
	if (customer.fullName) {
		facts.push(`name on file: ${customer.fullName}`);
	}
	if (customer.username) {
		facts.push(`username: ${customer.username}`);
	}
	if (customer.accountNumber) {
		facts.push(`account #: ${customer.accountNumber}`);
	}
	if (customer.status) {
		facts.push(`status: ${customer.status}`);
	}
	if (customer.planName) {
		facts.push(`plan: ${customer.planName}`);
	}
	if (opts.contactPhone) {
		facts.push(`phone: ${opts.contactPhone}`);
	}
	const usernameNote = customer.username
		? ` Pass "${customer.username}" as the \`query\` argument to ISP tools (isp-search-customer, isp-diagnose-customer, etc.) — do NOT search by phone or name.`
		: "";
	return (
		`VERIFIED CUSTOMER (auto-linked from their ${provider} number): ${facts.join(", ")}. ` +
		"This is the account this conversation is about. Do NOT ask the customer for their phone, username, or account number — you already have them." +
		usernameNote +
		" If the customer says the account is under a different person or number, only then ask for clarification."
	);
}
