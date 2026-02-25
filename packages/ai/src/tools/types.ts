import type { ServerTool } from "@tanstack/ai";

export interface ToolContext {
	organizationId: string;
	agentId: string;
	conversationId: string;
	externalChatId: string;
	contactName?: string | undefined;
	toolConfig?: Record<string, unknown> | undefined;
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
	type: "text" | "password" | "select";
	required: boolean;
	placeholder?: string | undefined;
	defaultValue?: string | undefined;
	options?: Array<{ label: string; value: string }> | undefined;
}

export type ToolFactory = (context: ToolContext) => ServerTool;

export interface RegisteredTool {
	metadata: ToolMetadata;
	factory: ToolFactory;
}
