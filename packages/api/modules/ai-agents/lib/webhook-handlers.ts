import type {
	ChannelProvider,
	GenerateResponseInput,
	ToolContext,
} from "@repo/ai";
import {
	decryptToken,
	generateAgentResponse,
	parseWebhookPayload,
	resolveTools,
	sendTextMessage,
	sendTypingIndicator,
	telegram,
	VERBOSE_TOOL_INSTRUCTION,
} from "@repo/ai";
import { config } from "@repo/config";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { checkAndIncrementQuota } from "@repo/quotas";

const FALLBACK_MESSAGE =
	"I'm having trouble right now. Please try again shortly.";
const QUOTA_EXCEEDED_MESSAGE =
	"This agent has reached its message limit. Please contact the organization administrator.";

async function handleMessages(
	webhookToken: string,
	provider: ChannelProvider,
	body: unknown,
	secretHeader?: string | null,
): Promise<Response> {
	// Look up channel by webhookToken
	const channel = await db.aiAgentChannel.findUnique({
		where: { webhookToken },
		include: {
			agent: true,
		},
	});

	if (!channel || !channel.enabled || !channel.agent.enabled) {
		return new Response("OK", { status: 200 });
	}

	// Telegram: validate secret token header
	if (
		provider === "telegram" &&
		channel.webhookSecret &&
		secretHeader !== channel.webhookSecret
	) {
		return new Response("OK", { status: 200 });
	}

	// Handle Telegram /start command
	if (
		provider === "telegram" &&
		telegram.isStartCommand(body) &&
		channel.agent.greetingMessage
	) {
		const messages = parseWebhookPayload(provider, body);
		if (messages[0]) {
			const apiToken = decryptToken(channel.encryptedApiToken);
			await sendTextMessage(
				provider,
				apiToken,
				messages[0].chatId,
				channel.agent.greetingMessage,
			);
		}
		return new Response("OK", { status: 200 });
	}

	const parsedMessages = parseWebhookPayload(provider, body);
	if (parsedMessages.length === 0) {
		return new Response("OK", { status: 200 });
	}

	const apiToken = decryptToken(channel.encryptedApiToken);

	for (const msg of parsedMessages) {
		try {
			// Truncate incoming message
			const truncatedText = msg.text.slice(0, config.ai.maxMessageLength);

			// Find or create conversation
			const conversation = await db.aiConversation.upsert({
				where: {
					channelId_externalChatId: {
						channelId: channel.id,
						externalChatId: msg.chatId,
					},
				},
				create: {
					agentId: channel.agent.id,
					channelId: channel.id,
					externalChatId: msg.chatId,
					contactName: msg.contactName ?? null,
					contactId: msg.contactId ?? null,
					lastMessageAt: new Date(),
					messageCount: 0,
				},
				update: {
					contactName: msg.contactName ?? null,
					lastMessageAt: new Date(),
				},
			});

			// Store user message
			await db.aiMessage.create({
				data: {
					conversationId: conversation.id,
					role: "user",
					content: truncatedText,
					externalMsgId: msg.messageId,
				},
			});

			// Check AI messages quota
			const quotaResult = await checkAndIncrementQuota(
				{
					type: "organization",
					organizationId: channel.agent.organizationId,
				},
				"aiMessages",
			);
			if (!quotaResult.allowed) {
				await sendTextMessage(
					provider,
					apiToken,
					msg.chatId,
					QUOTA_EXCEEDED_MESSAGE,
				);
				continue;
			}

			// Load conversation history
			const history = await db.aiMessage.findMany({
				where: { conversationId: conversation.id },
				orderBy: { createdAt: "desc" },
				take: channel.agent.maxHistoryLength,
				select: {
					role: true,
					content: true,
				},
			});

			// Reverse to chronological order
			const historyMessages = history.reverse().map((m) => ({
				role: (m.role === "admin" ? "assistant" : m.role) as
					| "user"
					| "assistant",
				content: m.content,
			}));

			// Resolve tools if agent has any enabled
			let tools: GenerateResponseInput["tools"];
			if (channel.agent.enabledTools.length > 0) {
				const agentToolConfigs = await db.aiAgentToolConfig.findMany({
					where: { agentId: channel.agent.id },
				});
				const perToolConfigs: Record<
					string,
					Record<string, unknown>
				> = {};
				for (const tc of agentToolConfigs) {
					perToolConfigs[tc.toolId] = tc.config as Record<
						string,
						unknown
					>;
				}

				const toolContext: ToolContext = {
					organizationId: channel.agent.organizationId,
					agentId: channel.agent.id,
					conversationId: conversation.id,
					externalChatId: msg.chatId,
					contactName: msg.contactName,
				};
				tools = resolveTools(
					channel.agent.enabledTools,
					toolContext,
					perToolConfigs,
				);
			}

			// Send typing indicator before generation
			sendTypingIndicator(provider, apiToken, msg.chatId).catch(() => {});

			// Enhance system prompt for verbose tool narration
			const systemPrompt = tools
				? channel.agent.systemPrompt + VERBOSE_TOOL_INSTRUCTION
				: channel.agent.systemPrompt;

			// Generate AI response with timeout
			const timeoutMs = config.ai.responseTimeoutMs;
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), timeoutMs);

			try {
				const result = await generateAgentResponse({
					model: channel.agent.model,
					systemPrompt,
					knowledgeBase: channel.agent.knowledgeBase ?? undefined,
					messages: historyMessages,
					temperature: channel.agent.temperature,
					abortController: controller,
					tools,
					maxSteps: tools ? 5 : undefined,
					onStepText: async (text) => {
						await sendTextMessage(
							provider,
							apiToken,
							msg.chatId,
							text,
						);
						sendTypingIndicator(
							provider,
							apiToken,
							msg.chatId,
						).catch(() => {});
					},
				});

				clearTimeout(timeout);

				// Send reply
				const sendResult = await sendTextMessage(
					provider,
					apiToken,
					msg.chatId,
					result.text,
				);

				// Store assistant message
				await db.aiMessage.create({
					data: {
						conversationId: conversation.id,
						role: "assistant",
						content: result.text,
						externalMsgId: sendResult.messageId ?? null,
						tokenCount: result.tokenCount,
						latencyMs: result.latencyMs,
						toolCalls: result.toolResults
							? JSON.parse(JSON.stringify(result.toolResults))
							: undefined,
					},
				});

				// Update conversation counters
				await db.aiConversation.update({
					where: { id: conversation.id },
					data: {
						messageCount: { increment: 2 },
						lastMessageAt: new Date(),
					},
				});
			} catch (error) {
				clearTimeout(timeout);

				const errorName = error instanceof Error ? error.name : "";

				if (errorName === "AI_InvalidToolInputError") {
					const toolError = error as Error & {
						toolName?: string;
					};
					logger.error("AI invalid tool input", {
						toolName: toolError.toolName,
						conversationId: conversation.id,
						provider,
					});
				} else if (errorName === "AI_NoSuchToolError") {
					const toolError = error as Error & {
						toolName?: string;
					};
					logger.error("AI tool not found", {
						toolName: toolError.toolName,
						conversationId: conversation.id,
						provider,
					});
				} else {
					logger.error("AI generation failed", {
						error,
						conversationId: conversation.id,
						provider,
					});
				}

				// Send fallback message
				await sendTextMessage(
					provider,
					apiToken,
					msg.chatId,
					FALLBACK_MESSAGE,
				);

				// Store error message
				await db.aiMessage.create({
					data: {
						conversationId: conversation.id,
						role: "assistant",
						content: FALLBACK_MESSAGE,
						error:
							error instanceof Error
								? error.message
								: "Unknown error",
					},
				});

				await db.aiConversation.update({
					where: { id: conversation.id },
					data: {
						messageCount: { increment: 2 },
						lastMessageAt: new Date(),
					},
				});
			}

			// Update channel activity
			await db.aiAgentChannel.update({
				where: { id: channel.id },
				data: { lastActivityAt: new Date() },
			});
		} catch (error) {
			logger.error("Webhook message processing failed", {
				error,
				provider,
				chatId: msg.chatId,
			});
		}
	}

	return new Response("OK", { status: 200 });
}

export async function whatsappWebhookHandler(
	request: Request,
	webhookToken: string,
): Promise<Response> {
	try {
		const body = await request.json();
		return handleMessages(webhookToken, "whatsapp", body);
	} catch (error) {
		logger.error("WhatsApp webhook error", { error });
		return new Response("OK", { status: 200 });
	}
}

export async function telegramWebhookHandler(
	request: Request,
	webhookToken: string,
): Promise<Response> {
	try {
		const body = await request.json();
		const secretHeader = request.headers.get(
			"x-telegram-bot-api-secret-token",
		);
		return handleMessages(webhookToken, "telegram", body, secretHeader);
	} catch (error) {
		logger.error("Telegram webhook error", { error });
		return new Response("OK", { status: 200 });
	}
}
