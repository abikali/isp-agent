import { ORPCError } from "@orpc/server";
import type { ChannelProvider, SendMediaOptions } from "@repo/ai";
import {
	decryptToken,
	needsAudioRemux,
	remuxWebmToOgg,
	sendMediaMessage,
	sendTextMessage,
} from "@repo/ai";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { db } from "@repo/database";
import { getRedisConnection } from "@repo/jobs";
import { logger } from "@repo/logs";
import { getSignedUrl, uploadBuffer } from "@repo/storage";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { trackBotMessage } from "../lib/bot-fingerprint";

export const sendAdminMessage = protectedProcedure
	.route({
		method: "POST",
		path: "/ai-agents/conversations/{conversationId}/admin-message",
		tags: ["AI Agents"],
		summary: "Send an admin message to a conversation (human takeover)",
	})
	.input(
		z.object({
			conversationId: z.string(),
			organizationId: z.string(),
			message: z.string().min(1).max(4000),
			replyToId: z.string().optional(),
			attachmentType: z
				.enum([
					"image",
					"video",
					"audio",
					"document",
					"location",
					"sticker",
				])
				.optional(),
			attachmentUrl: z.string().optional(),
			attachmentFilename: z.string().optional(),
			attachmentMimeType: z.string().optional(),
			attachmentSize: z.number().optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const member = await verifyOrganizationMembership(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "You must be a member of this organization",
			});
		}

		const conversation = await db.aiConversation.findFirst({
			where: { id: input.conversationId },
			include: {
				agent: {
					select: {
						organizationId: true,
						humanTakeoverHours: true,
					},
				},
				channel: true,
			},
		});

		if (
			!conversation ||
			conversation.agent.organizationId !== input.organizationId
		) {
			throw new ORPCError("NOT_FOUND", {
				message: "Conversation not found",
			});
		}

		const messageData: Record<string, unknown> = {
			conversationId: conversation.id,
			role: "admin",
			content: input.message,
			replyToId: input.replyToId ?? null,
			attachmentType: input.attachmentType ?? null,
			attachmentUrl: input.attachmentUrl ?? null,
			attachmentFilename: input.attachmentFilename ?? null,
			attachmentMimeType: input.attachmentMimeType ?? null,
			attachmentSize: input.attachmentSize ?? null,
		};

		// For channel conversations (WhatsApp/Telegram), send the message externally
		if (conversation.channel) {
			try {
				const apiToken = decryptToken(
					conversation.channel.encryptedApiToken,
				);
				const provider = conversation.channel
					.provider as ChannelProvider;
				let sendResult: {
					success: boolean;
					messageId?: string | undefined;
				};

				// Send media if attachment is present
				const mediaTypes = [
					"image",
					"video",
					"audio",
					"document",
					"sticker",
				] as const;
				if (
					input.attachmentType &&
					input.attachmentUrl &&
					mediaTypes.includes(
						input.attachmentType as (typeof mediaTypes)[number],
					)
				) {
					try {
						const bucket =
							process.env["AVATARS_BUCKET_NAME"] ??
							"libancom-dev";

						let mediaPath = input.attachmentUrl;

						// Remux WebM audio to OGG for WhatsApp compatibility
						if (
							input.attachmentType === "audio" &&
							input.attachmentMimeType &&
							needsAudioRemux(input.attachmentMimeType)
						) {
							try {
								const webmUrl = await getSignedUrl(
									input.attachmentUrl,
									{ bucket, expiresIn: 60 },
								);
								const webmResponse = await fetch(webmUrl);
								const webmBuffer = Buffer.from(
									await webmResponse.arrayBuffer(),
								);
								const oggBuffer =
									await remuxWebmToOgg(webmBuffer);
								const oggPath = input.attachmentUrl.replace(
									/\.webm$/,
									".ogg",
								);
								await uploadBuffer(oggPath, oggBuffer, {
									bucket,
									contentType: "audio/ogg;codecs=opus",
								});
								mediaPath = oggPath;
							} catch (remuxError) {
								logger.warn(
									"Audio remux failed, sending original",
									{ error: remuxError },
								);
							}
						}

						const signedUrl = await getSignedUrl(mediaPath, {
							bucket,
							expiresIn: 300,
						});
						sendResult = await sendMediaMessage(
							provider,
							apiToken,
							conversation.externalChatId,
							{
								mediaType:
									input.attachmentType as SendMediaOptions["mediaType"],
								mediaUrl: signedUrl,
								caption: input.message || undefined,
								filename: input.attachmentFilename ?? undefined,
							},
						);
					} catch (mediaError) {
						logger.warn(
							"Media send failed, falling back to text-only",
							{
								error: mediaError,
								attachmentType: input.attachmentType,
								conversationId: conversation.id,
							},
						);
						// Fall back to text-only
						sendResult = await sendTextMessage(
							provider,
							apiToken,
							conversation.externalChatId,
							input.message,
						);
					}
				} else {
					sendResult = await sendTextMessage(
						provider,
						apiToken,
						conversation.externalChatId,
						input.message,
					);
				}

				messageData["externalMsgId"] = sendResult.messageId ?? null;

				// Track sent message by content fingerprint so we don't mistake the echo for human activity
				trackBotMessage(getRedisConnection(), input.message);
			} catch (error) {
				logger.error("Failed to send admin message to channel", {
					error,
					conversationId: conversation.id,
					provider: conversation.channel.provider,
				});
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Failed to send message to channel",
				});
			}
		}

		// Store the admin message
		const msg = await db.aiMessage.create({
			data: messageData as never,
		});

		// Admin sending = human takeover (pause AI responses)
		const updateData: Record<string, unknown> = {
			messageCount: { increment: 1 },
			lastMessageAt: new Date(),
		};
		if (conversation.agent.humanTakeoverHours) {
			updateData["humanTakeoverAt"] = new Date();
		}

		// Update conversation counters + takeover
		await db.aiConversation.update({
			where: { id: conversation.id },
			data: updateData,
		});

		return {
			message: {
				id: msg.id,
				role: msg.role,
				content: msg.content,
				createdAt: msg.createdAt,
			},
		};
	});
