import type { ChannelProvider } from "@repo/ai";
import { decryptToken, sendTextMessage } from "@repo/ai";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { queueSimpleEmail } from "../jobs/email.jobs";

interface NotificationChannel {
	type: "email" | "whatsapp" | "telegram";
	email?: string | undefined;
	channelId?: string | undefined;
	chatId?: string | undefined;
	enabled: boolean;
}

interface NotificationConfig {
	channels: NotificationChannel[];
	events: {
		down: boolean;
		recovery: boolean;
		reminder: boolean;
	};
	reminderIntervalMinutes?: number | undefined;
}

interface NotificationContext {
	watcherName: string;
	eventType: "down" | "recovery" | "reminder";
	message: string;
}

function buildNotificationText(ctx: NotificationContext): {
	subject: string;
	text: string;
	html: string;
} {
	switch (ctx.eventType) {
		case "down": {
			return {
				subject: `[Down] ${ctx.watcherName} is not responding`,
				text: `${ctx.watcherName} is down. ${ctx.message}`,
				html: `<p><strong>${ctx.watcherName}</strong> is down.</p><p>${ctx.message}</p>`,
			};
		}
		case "recovery": {
			return {
				subject: `[Recovered] ${ctx.watcherName} is back up`,
				text: `${ctx.watcherName} is back up. ${ctx.message}`,
				html: `<p><strong>${ctx.watcherName}</strong> is back up and responding normally.</p><p>${ctx.message}</p>`,
			};
		}
		case "reminder": {
			return {
				subject: `[Still Down] ${ctx.watcherName} is still not responding`,
				text: `Reminder: ${ctx.watcherName} is still down. ${ctx.message}`,
				html: `<p><strong>${ctx.watcherName}</strong> is still down.</p><p>${ctx.message}</p>`,
			};
		}
	}
}

export function parseNotificationConfig(
	raw: unknown,
): NotificationConfig | null {
	if (!raw || typeof raw !== "object") {
		return null;
	}
	const config = raw as NotificationConfig;
	if (!Array.isArray(config.channels) || !config.events) {
		return null;
	}
	return config;
}

export async function dispatchWatcherNotifications(
	config: NotificationConfig,
	ctx: NotificationContext,
): Promise<void> {
	if (!config.events[ctx.eventType]) {
		return;
	}

	const enabledChannels = config.channels.filter((ch) => ch.enabled);
	if (enabledChannels.length === 0) {
		return;
	}

	const { subject, text, html } = buildNotificationText(ctx);

	const results = await Promise.allSettled(
		enabledChannels.map(async (channel) => {
			if (channel.type === "email" && channel.email) {
				await queueSimpleEmail({
					to: channel.email,
					subject,
					text,
					html,
				});
				return;
			}

			if (
				(channel.type === "whatsapp" || channel.type === "telegram") &&
				channel.channelId &&
				channel.chatId
			) {
				const dbChannel = await db.aiAgentChannel.findUnique({
					where: { id: channel.channelId },
					select: { encryptedApiToken: true, provider: true },
				});

				if (!dbChannel) {
					logger.warn(
						"Messaging channel not found for watcher notification",
						{
							channelId: channel.channelId,
						},
					);
					return;
				}

				const apiToken = decryptToken(dbChannel.encryptedApiToken);
				const result = await sendTextMessage(
					dbChannel.provider as ChannelProvider,
					apiToken,
					channel.chatId,
					text,
				);

				if (!result.success) {
					logger.error(
						"Failed to send watcher notification via messaging",
						{
							provider: dbChannel.provider,
							channelId: channel.channelId,
						},
					);
				}
				return;
			}

			logger.warn("Invalid watcher notification channel config", {
				type: channel.type,
			});
		}),
	);

	for (const result of results) {
		if (result.status === "rejected") {
			logger.error("Watcher notification dispatch error", {
				error: result.reason,
			});
		}
	}
}
