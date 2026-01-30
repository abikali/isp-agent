import { WEBHOOK_EVENTS } from "@repo/webhooks";
import z from "zod";

export const WebhookEventSchema = z.enum(
	Object.keys(WEBHOOK_EVENTS) as [string, ...string[]],
);

export type WebhookEvent = z.infer<typeof WebhookEventSchema>;
