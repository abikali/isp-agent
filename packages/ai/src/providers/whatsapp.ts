import { logger } from "@repo/logs";
import type { ParsedMessage, SendMessageResult } from "../types";

const WHAPI_BASE_URL = "https://gate.whapi.cloud";

interface WhapiMessage {
	id: string;
	type: string;
	text?: { body: string };
	from: string;
	from_me: boolean;
	from_name?: string;
	source?: string | undefined;
	chat_id: string;
	timestamp: number;
}

interface WhapiEvent {
	type: string;
	event: string;
}

interface WhapiWebhookPayload {
	messages?: WhapiMessage[];
	event?: WhapiEvent | undefined;
	channel_id?: string | undefined;
}

interface WhapiSendResponse {
	sent?: boolean | undefined;
	message?: { id?: string | undefined } | undefined;
}

export function parseWebhookPayload(body: unknown): ParsedMessage[] {
	const payload = body as WhapiWebhookPayload;
	if (!payload.messages || !Array.isArray(payload.messages)) {
		return [];
	}

	return payload.messages
		.filter((msg) => msg.type === "text" && msg.text?.body && !msg.from_me)
		.map(
			(msg): ParsedMessage => ({
				chatId: msg.chat_id,
				messageId: msg.id,
				text: msg.text?.body ?? "",
				contactName: msg.from_name ?? undefined,
				contactId: msg.from,
				timestamp: msg.timestamp,
			}),
		);
}

export async function sendTypingIndicator(
	apiToken: string,
	chatId: string,
): Promise<void> {
	try {
		await fetch(`${WHAPI_BASE_URL}/presences/${chatId}`, {
			method: "PUT",
			headers: {
				Authorization: `Bearer ${apiToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ status: "typing" }),
		});
	} catch (error) {
		logger.error("WhatsApp typing indicator error", { error });
	}
}

export async function sendTextMessage(
	apiToken: string,
	chatId: string,
	text: string,
): Promise<SendMessageResult> {
	try {
		const response = await fetch(`${WHAPI_BASE_URL}/messages/text`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				to: chatId,
				body: text,
			}),
		});

		if (!response.ok) {
			const errorText = await response.text();
			logger.error("WhatsApp send failed", {
				status: response.status,
				error: errorText,
			});
			return { success: false };
		}

		const data = (await response.json()) as WhapiSendResponse;
		const messageId = data.message?.id ?? undefined;
		return { success: data.sent !== false, messageId };
	} catch (error) {
		logger.error("WhatsApp send error", { error });
		return { success: false };
	}
}
