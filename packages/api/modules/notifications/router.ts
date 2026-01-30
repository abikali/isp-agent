import { createId } from "@paralleldrive/cuid2";
import { db } from "@repo/database";
import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../../orpc/procedures";

// List notifications for the current user
const listNotifications = protectedProcedure
	.route({
		method: "GET",
		path: "/notifications",
		tags: ["Notifications"],
		summary: "List notifications for the current user",
	})
	.input(
		z.object({
			limit: z.number().min(1).max(100).default(20),
			offset: z.number().min(0).default(0),
			unreadOnly: z.boolean().default(false),
		}),
	)
	.handler(async ({ input, context: { user } }) => {
		const notifications = await db.notification.findMany({
			where: {
				userId: user.id,
				...(input.unreadOnly ? { read: false } : {}),
			},
			orderBy: { createdAt: "desc" },
			take: input.limit,
			skip: input.offset,
		});

		const total = await db.notification.count({
			where: {
				userId: user.id,
				...(input.unreadOnly ? { read: false } : {}),
			},
		});

		const unreadCount = await db.notification.count({
			where: {
				userId: user.id,
				read: false,
			},
		});

		return {
			notifications,
			total,
			unreadCount,
		};
	});

// Get unread notification count
const getUnreadCount = protectedProcedure
	.route({
		method: "GET",
		path: "/notifications/unread-count",
		tags: ["Notifications"],
		summary: "Get unread notification count",
	})
	.handler(async ({ context: { user } }) => {
		const count = await db.notification.count({
			where: {
				userId: user.id,
				read: false,
			},
		});

		return { count };
	});

// Mark notification as read
const markAsRead = protectedProcedure
	.route({
		method: "PUT",
		path: "/notifications/{id}/read",
		tags: ["Notifications"],
		summary: "Mark a notification as read",
	})
	.input(z.object({ id: z.string() }))
	.handler(async ({ input, context: { user } }) => {
		await db.notification.updateMany({
			where: {
				id: input.id,
				userId: user.id,
			},
			data: { read: true },
		});

		return { success: true };
	});

// Mark all notifications as read
const markAllAsRead = protectedProcedure
	.route({
		method: "PUT",
		path: "/notifications/mark-all-read",
		tags: ["Notifications"],
		summary: "Mark all notifications as read",
	})
	.handler(async ({ context: { user } }) => {
		await db.notification.updateMany({
			where: {
				userId: user.id,
				read: false,
			},
			data: { read: true },
		});

		return { success: true };
	});

// Delete a notification
const deleteNotification = protectedProcedure
	.route({
		method: "DELETE",
		path: "/notifications/{id}",
		tags: ["Notifications"],
		summary: "Delete a notification",
	})
	.input(z.object({ id: z.string() }))
	.handler(async ({ input, context: { user } }) => {
		await db.notification.deleteMany({
			where: {
				id: input.id,
				userId: user.id,
			},
		});

		return { success: true };
	});

// Delete all read notifications
const deleteAllRead = protectedProcedure
	.route({
		method: "DELETE",
		path: "/notifications/read",
		tags: ["Notifications"],
		summary: "Delete all read notifications",
	})
	.handler(async ({ context: { user } }) => {
		await db.notification.deleteMany({
			where: {
				userId: user.id,
				read: true,
			},
		});

		return { success: true };
	});

// Default preferences (used when user has no saved preferences)
const DEFAULT_PREFERENCES = {
	leadsInApp: true,
	leadsEmail: true,
	teamInApp: true,
	teamEmail: true,
	analyticsInApp: true,
	analyticsEmail: false,
	securityInApp: true,
	securityEmail: true,
};

// Get notification preferences
const getPreferences = protectedProcedure
	.route({
		method: "GET",
		path: "/notifications/preferences",
		tags: ["Notifications"],
		summary: "Get notification preferences",
	})
	.handler(async ({ context: { user } }) => {
		const preferences = await db.notificationPreference.findUnique({
			where: { userId: user.id },
		});

		if (!preferences) {
			return DEFAULT_PREFERENCES;
		}

		return {
			leadsInApp: preferences.leadsInApp,
			leadsEmail: preferences.leadsEmail,
			teamInApp: preferences.teamInApp,
			teamEmail: preferences.teamEmail,
			analyticsInApp: preferences.analyticsInApp,
			analyticsEmail: preferences.analyticsEmail,
			securityInApp: preferences.securityInApp,
			securityEmail: preferences.securityEmail,
		};
	});

// Update notification preferences
const updatePreferences = protectedProcedure
	.route({
		method: "PUT",
		path: "/notifications/preferences",
		tags: ["Notifications"],
		summary: "Update notification preferences",
	})
	.input(
		z.object({
			leadsInApp: z.boolean().optional(),
			leadsEmail: z.boolean().optional(),
			teamInApp: z.boolean().optional(),
			teamEmail: z.boolean().optional(),
			analyticsInApp: z.boolean().optional(),
			analyticsEmail: z.boolean().optional(),
			securityInApp: z.boolean().optional(),
			securityEmail: z.boolean().optional(),
		}),
	)
	.handler(async ({ input, context: { user } }) => {
		// Filter out undefined values for exactOptionalPropertyTypes compatibility
		const updateData = Object.fromEntries(
			Object.entries(input).filter(([, v]) => v !== undefined),
		);

		const preferences = await db.notificationPreference.upsert({
			where: { userId: user.id },
			create: {
				id: createId(),
				userId: user.id,
				...DEFAULT_PREFERENCES,
				...updateData,
			},
			update: updateData,
		});

		return {
			leadsInApp: preferences.leadsInApp,
			leadsEmail: preferences.leadsEmail,
			teamInApp: preferences.teamInApp,
			teamEmail: preferences.teamEmail,
			analyticsInApp: preferences.analyticsInApp,
			analyticsEmail: preferences.analyticsEmail,
			securityInApp: preferences.securityInApp,
			securityEmail: preferences.securityEmail,
		};
	});

export const notificationsRouter = publicProcedure.router({
	list: listNotifications,
	unreadCount: getUnreadCount,
	markAsRead,
	markAllAsRead,
	delete: deleteNotification,
	deleteAllRead,
	getPreferences,
	updatePreferences,
});
