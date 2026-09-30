import {
	type ChannelProvider,
	isSpeakableReply,
	type ModelCredentials,
	sendMediaMessage,
	supportsVoiceReplies,
	synthesizeSpeech,
} from "@repo/ai";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { getSignedUrl, uploadBuffer } from "@repo/storage";

/**
 * Speak the bot's reply back when the customer sent a voice note (#18).
 * Runs after the text was sent (fire-and-forget), so reply latency is
 * unchanged and the text — which carries every detail — always arrives.
 * Gated by the agent's `voiceReplies` toggle (default off) and OpenAI-direct
 * credentials; every other case is a silent no-op.
 */
export async function sendVoiceReply(input: {
	agent: {
		voiceReplies: boolean;
		voiceReplyModel: string | null;
		organizationId: string;
	};
	credentials: ModelCredentials;
	provider: ChannelProvider;
	apiToken: string;
	chatId: string;
	conversationId: string;
	/** The assistant row that holds the text reply. */
	assistantMessageId: string | null;
	/** The customer's triggering message was a voice note. */
	triggeredByVoice: boolean;
	text: string;
}): Promise<boolean> {
	if (
		!input.agent.voiceReplies ||
		!input.triggeredByVoice ||
		input.provider !== "whatsapp" ||
		!supportsVoiceReplies(input.credentials.provider) ||
		!isSpeakableReply(input.text)
	) {
		return false;
	}
	try {
		const speech = await synthesizeSpeech(
			input.credentials,
			input.text,
			input.agent.voiceReplyModel,
		);
		if (!speech) {
			return false;
		}
		const { createId } = await import("@paralleldrive/cuid2");
		const bucket = process.env["AVATARS_BUCKET_NAME"] ?? "libancom-dev";
		const path = `chat-attachments/${input.agent.organizationId}/${input.conversationId}/${createId()}.${speech.extension}`;
		await uploadBuffer(path, speech.bytes, {
			bucket,
			contentType: speech.mime,
		});
		const url = await getSignedUrl(path, { bucket, expiresIn: 3600 });
		const result = await sendMediaMessage(
			input.provider,
			input.apiToken,
			input.chatId,
			{ mediaType: "audio", mediaUrl: url },
		);
		if (result.success && input.assistantMessageId) {
			await db.aiMessage.update({
				where: { id: input.assistantMessageId },
				data: {
					attachmentType: "audio",
					attachmentUrl: path,
					attachmentMimeType: speech.mime,
					attachmentSize: speech.bytes.length,
				},
			});
		}
		return result.success;
	} catch (error) {
		logger.warn("[voice-reply] failed", {
			conversationId: input.conversationId,
			error: error instanceof Error ? error.message : String(error),
		});
		return false;
	}
}
