import type { Tool } from "ai";

export interface ToolContext {
	organizationId: string;
	agentId: string;
	conversationId: string;
	externalChatId: string;
	contactName?: string | undefined;
	/**
	 * Digit-only phone the messaging provider has on file for this contact
	 * (e.g. WhatsApp `cleanedSenderPn`). Tools that look up an ISP customer
	 * use this as the authoritative identifier so the agent can't substitute
	 * a name or a remembered-from-history username instead.
	 */
	contactPhone?: string | undefined;
	toolConfig?: Record<string, unknown> | undefined;
	/**
	 * Returns the iRadius customer matching `contactPhone`, memoized for the
	 * lifetime of this turn so multiple ISP tools share one network round-trip.
	 * Returns `null` when no phone is set, ISP API is not configured, or the
	 * lookup result is empty/ambiguous. Wired by `resolveTools`; tools should
	 * call this instead of `lookupCustomerByContactPhone` directly.
	 */
	getVerifiedIspCustomer?: () => Promise<Record<string, unknown> | null>;
}

export interface ToolMetadata {
	id: string;
	name: string;
	description: string;
	category:
		| "networking"
		| "scheduling"
		| "enrichment"
		| "crm"
		| "diagnostics"
		| "customer"
		| "isp";
	requiresConfig: boolean;
	configFields?: ConfigField[] | undefined;
}

export interface ConfigField {
	key: string;
	label: string;
	type: "text" | "password" | "select" | "textarea" | "repeater";
	required: boolean;
	placeholder?: string | undefined;
	defaultValue?: string | undefined;
	description?: string | undefined;
	options?: Array<{ label: string; value: string }> | undefined;
}

// biome-ignore lint/suspicious/noExplicitAny: Tool generic params vary per tool
export type ToolFactory = (context: ToolContext) => Tool<any, any>;

export interface RegisteredTool {
	metadata: ToolMetadata;
	factory: ToolFactory;
	defaultPromptSection?: string | undefined;
}
