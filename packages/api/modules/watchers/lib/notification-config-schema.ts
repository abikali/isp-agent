import z from "zod";

const emailChannelSchema = z.object({
	type: z.literal("email"),
	email: z.string().email(),
	enabled: z.boolean(),
});

const messagingChannelSchema = z.object({
	type: z.enum(["whatsapp", "telegram"]),
	channelId: z.string().min(1),
	chatId: z.string().min(1),
	enabled: z.boolean(),
});

const notificationChannelSchema = z.discriminatedUnion("type", [
	emailChannelSchema,
	messagingChannelSchema,
]);

export const notificationConfigSchema = z.object({
	channels: z.array(notificationChannelSchema).max(10),
	events: z.object({
		down: z.boolean(),
		recovery: z.boolean(),
		reminder: z.boolean(),
	}),
	reminderIntervalMinutes: z.number().int().min(15).max(1440).optional(),
});

export type NotificationConfig = z.infer<typeof notificationConfigSchema>;
