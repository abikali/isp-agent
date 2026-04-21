import { db } from "@repo/database";
import { getBadgeCountForUser } from "@repo/notifications";
import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../../orpc/procedures";

const subscribe = protectedProcedure
	.route({
		method: "POST",
		path: "/push/subscribe",
		tags: ["Push"],
		summary: "Register a web-push subscription for the current user",
	})
	.input(
		z.object({
			endpoint: z.string().url(),
			p256dh: z.string().min(1),
			auth: z.string().min(1),
			userAgent: z.string().optional(),
		}),
	)
	.handler(async ({ input, context: { user } }) => {
		const data: {
			userId: string;
			p256dh: string;
			auth: string;
			userAgent: string | null;
		} = {
			userId: user.id,
			p256dh: input.p256dh,
			auth: input.auth,
			userAgent: input.userAgent ?? null,
		};
		await db.pushSubscription.upsert({
			where: { endpoint: input.endpoint },
			create: { endpoint: input.endpoint, ...data },
			update: data,
		});
		return { success: true };
	});

const unsubscribe = protectedProcedure
	.route({
		method: "POST",
		path: "/push/unsubscribe",
		tags: ["Push"],
		summary: "Remove a web-push subscription",
	})
	.input(z.object({ endpoint: z.string().url() }))
	.handler(async ({ input, context: { user } }) => {
		await db.pushSubscription.deleteMany({
			where: { endpoint: input.endpoint, userId: user.id },
		});
		return { success: true };
	});

const badgeCount = protectedProcedure
	.route({
		method: "GET",
		path: "/push/badge-count",
		tags: ["Push"],
		summary: "Total unreviewed payments across all of a user's orgs",
	})
	.handler(async ({ context: { user } }) => {
		const count = await getBadgeCountForUser(user.id);
		return { count };
	});

export const pushRouter = publicProcedure.router({
	subscribe,
	unsubscribe,
	badgeCount,
});
