import type { ServerTool } from "@tanstack/ai";

export interface ParsedMessage {
	chatId: string;
	messageId: string;
	text: string;
	contactName?: string | undefined;
	contactId?: string | undefined;
	timestamp?: number | undefined;
	/** Whapi media ID for downloading via GET /media/{id} */
	mediaId?: string | undefined;
	/** Type of media: "voice", "image", etc. */
	mediaType?: string | undefined;
	/** Caption attached to image/video media */
	mediaCaption?: string | undefined;
}

export interface SendMessageResult {
	success: boolean;
	messageId?: string | undefined;
}

export interface SendMessageOptions {
	quoted?: string | undefined;
	typingTime?: number | undefined;
}

export interface GenerateResponseInput {
	model: string;
	systemPrompt: string;
	knowledgeBase?: string | undefined;
	messages: Array<{ role: "user" | "assistant"; content: string }>;
	temperature?: number | undefined;
	abortController?: AbortController | undefined;
	tools?: ServerTool[] | undefined;
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
