import { createId } from "@paralleldrive/cuid2";
import { db } from "@repo/database";

export type NotificationType = "info" | "success" | "warning" | "error";

interface CreateNotificationInput {
	userId: string;
	type: NotificationType;
	title: string;
	message: string;
	link?: string;
}

/**
 * Create a notification for a user
 */
export async function createNotification(
	input: CreateNotificationInput,
): Promise<void> {
	await db.notification.create({
		data: {
			id: createId(),
			userId: input.userId,
			type: input.type,
			title: input.title,
			message: input.message,
			link: input.link ?? null,
		},
	});
}

/**
 * Create notifications for multiple users
 */
export async function createBulkNotifications(
	userIds: string[],
	notification: Omit<CreateNotificationInput, "userId">,
): Promise<void> {
	await db.notification.createMany({
		data: userIds.map((userId) => ({
			id: createId(),
			userId,
			type: notification.type,
			title: notification.title,
			message: notification.message,
			link: notification.link ?? null,
		})),
	});
}

/**
 * Create a notification for all members of an organization
 */
export async function createOrganizationNotification(
	organizationId: string,
	notification: Omit<CreateNotificationInput, "userId">,
): Promise<void> {
	const members = await db.member.findMany({
		where: { organizationId },
		select: { userId: true },
	});

	const userIds = members.map((m) => m.userId);

	if (userIds.length > 0) {
		await createBulkNotifications(userIds, notification);
	}
}
