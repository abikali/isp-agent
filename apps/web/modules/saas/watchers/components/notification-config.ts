import type { NotificationConfig } from "./NotificationSettings";

/**
 * Convert the frontend notification config to the shape expected by the API.
 * The API uses a zod discriminated union, so we need to narrow channels by type.
 */
export function toApiNotificationConfig(config: NotificationConfig):
	| {
			channels: (
				| { type: "email"; email: string; enabled: boolean }
				| {
						type: "whatsapp" | "telegram";
						channelId: string;
						chatId: string;
						enabled: boolean;
				  }
			)[];
			events: { down: boolean; recovery: boolean; reminder: boolean };
			reminderIntervalMinutes?: number | undefined;
	  }
	| undefined {
	if (config.channels.length === 0) {
		return undefined;
	}

	const channels = config.channels
		.map((ch) => {
			if (ch.type === "email" && ch.email) {
				return {
					type: "email" as const,
					email: ch.email,
					enabled: ch.enabled,
				};
			}
			if (
				(ch.type === "whatsapp" || ch.type === "telegram") &&
				ch.channelId &&
				ch.chatId
			) {
				return {
					type: ch.type,
					channelId: ch.channelId,
					chatId: ch.chatId,
					enabled: ch.enabled,
				};
			}
			return null;
		})
		.filter((ch) => ch !== null);

	return {
		channels,
		events: config.events,
		reminderIntervalMinutes: config.reminderIntervalMinutes,
	};
}
