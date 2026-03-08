import type { ToolSet } from "ai";

export interface ParsedMessage {
	chatId: string;
	messageId: string;
	text: string;
	contactName?: string | undefined;
	contactId?: string | undefined;
	timestamp?: number | undefined;
	/** Provider-specific media identifier */
	mediaId?: string | undefined;
	/** Serialized media payload for provider-specific download (e.g. WaSender decrypt data) */
	mediaLink?: string | undefined;
	/** Type of media: "voice", "image", etc. */
	mediaType?: string | undefined;
	/** Caption attached to image/video media */
	mediaCaption?: string | undefined;
	/** Original filename for document attachments */
	mediaFileName?: string | undefined;
}

export interface SendMessageResult {
	success: boolean;
	messageId?: string | undefined;
}

export interface SendMessageOptions {
	quoted?: string | undefined;
	typingTime?: number | undefined;
}

/** A tool record as accepted by streamText/generateText. */
export type ToolRecord = ToolSet;

export interface GenerateResponseInput {
	model: string;
	systemPrompt: string;
	knowledgeBase?: string | undefined;
	messages: Array<{ role: "user" | "assistant"; content: string }>;
	temperature?: number | undefined;
	abortSignal?: AbortSignal | undefined;
	tools?: ToolRecord | undefined;
	maxSteps?: number | undefined;
	/** Called with intermediate text when a step finishes with a tool call (for sending progress messages). */
	onStepText?: ((text: string) => Promise<void>) | undefined;
	/** Called on tool call start/end events. Use to re-send typing indicators during long tool chains. */
	onToolActivity?: (() => void) | undefined;
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
