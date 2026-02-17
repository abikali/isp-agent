import type { ServerTool } from "@tanstack/ai";

export interface ParsedMessage {
	chatId: string;
	messageId: string;
	text: string;
	contactName?: string | undefined;
	contactId?: string | undefined;
	timestamp?: number | undefined;
}

export interface SendMessageResult {
	success: boolean;
	messageId?: string | undefined;
}

export interface GenerateResponseInput {
	model: string;
	systemPrompt: string;
	knowledgeBase?: string | undefined;
	messages: Array<{ role: "user" | "assistant"; content: string }>;
	temperature?: number | undefined;
	abortController?: AbortController | undefined;
	// biome-ignore lint/suspicious/noExplicitAny: Server tools have varying input/output types
	tools?: Array<ServerTool<any, any, string>> | undefined;
	maxSteps?: number | undefined;
	/** Called with intermediate text when a step finishes with a tool call (for sending progress messages). */
	onStepText?: ((text: string) => Promise<void>) | undefined;
}

export interface ToolResult {
	toolName: string;
	args: unknown;
	result: unknown;
}

export interface GenerateResponseResult {
	text: string;
	tokenCount: number;
	latencyMs: number;
	toolResults?: ToolResult[] | undefined;
}

export type ChannelProvider = "whatsapp" | "telegram";
