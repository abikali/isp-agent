import type {
	JSONValue,
	ModelMessage,
	PrepareStepFunction,
	StopCondition,
	TelemetrySettings,
	ToolSet,
} from "ai";

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
	/** Whether this message was sent by us (fromMe flag from WhatsApp) */
	fromMe?: boolean | undefined;
	/** Latitude for location messages */
	latitude?: number | undefined;
	/** Longitude for location messages */
	longitude?: number | undefined;
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

/** Structural type for `providerOptions` — see model-registry CACHE_BREAKPOINT. */
export type ProviderOptions = Record<string, Record<string, JSONValue>>;

export interface GenerateResponseInput {
	model: string;
	/**
	 * Full canonical message list — system message(s) + history + new user
	 * message. The caller is responsible for building this; this preserves
	 * tool-call/tool-result structure across turns.
	 */
	messages: ModelMessage[];
	temperature?: number | undefined;
	/**
	 * OpenRouter session ID for cache-sticky provider routing — pass the
	 * conversation ID so all turns of a conversation hit the same upstream.
	 */
	sessionId?: string | undefined;
	abortSignal?: AbortSignal | undefined;
	tools?: ToolRecord | undefined;
	/** Stop conditions. Defaults to stepCountIs(20). */
	stopWhen?: StopCondition<ToolSet> | StopCondition<ToolSet>[] | undefined;
	/** OpenTelemetry settings — wire to Langfuse/Phoenix/Helicone. */
	telemetry?: TelemetrySettings | undefined;
	/** Per-step settings override (model/activeTools/toolChoice). */
	// biome-ignore lint/suspicious/noExplicitAny: PrepareStepFunction is heavily generic.
	prepareStep?: PrepareStepFunction<any> | undefined;
	/** Subset of tools active for THIS call (full registry is still attached). */
	activeTools?: string[] | undefined;
	/** Top-level provider options forwarded to streamText. */
	providerOptions?: ProviderOptions | undefined;
	/** Called with intermediate text when a step finishes with a tool call (for sending progress messages). */
	onStepText?: ((text: string) => Promise<void>) | undefined;
	/** Called on tool call start/end events. Use to re-send typing indicators during long tool chains. */
	onToolActivity?: (() => void) | undefined;
}

export interface ToolResult {
	toolCallId?: string | undefined;
	toolName: string;
	args: unknown;
	result: unknown;
}

export interface GenerateResponseResult {
	text: string;
	/** Total tokens (input + output). Kept for backward compatibility. */
	tokenCount: number;
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	/** Authoritative billed USD for this generation (OpenRouter usage accounting). */
	costUsd?: number | undefined;
	latencyMs: number;
	toolResults?: ToolResult[] | undefined;
}

export type ChannelProvider = "whatsapp" | "telegram";

export interface SendMediaOptions {
	mediaType:
		| "image"
		| "video"
		| "audio"
		| "document"
		| "sticker"
		| "location";
	mediaUrl?: string | undefined;
	caption?: string | undefined;
	filename?: string | undefined;
	latitude?: number | undefined;
	longitude?: number | undefined;
}

export type { ModelMessage };
