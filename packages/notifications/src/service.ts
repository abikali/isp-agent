import { createId } from "@paralleldrive/cuid2";
import { db } from "@repo/database";
import { queueSimpleEmail, queueTemplateEmail } from "@repo/jobs";
import { logger } from "@repo/logs";

export type NotificationCategory = "leads" | "team" | "analytics" | "security";
export type NotificationType = "info" | "success" | "warning" | "error";

export interface NotificationPayload {
	userId: string;
	category: NotificationCategory;
	type: NotificationType;
	title: string;
	message: string;
	link?: string;
	// Email-specific fields
	emailTemplateId?: string;
	emailContext?: Record<string, unknown>;
	emailSubject?: string;
	emailHtml?: string;
}

interface UserPreferences {
	leadsInApp: boolean;
	leadsEmail: boolean;
	teamInApp: boolean;
	teamEmail: boolean;
	analyticsInApp: boolean;
	analyticsEmail: boolean;
	securityInApp: boolean;
	securityEmail: boolean;
}

const DEFAULT_PREFERENCES: UserPreferences = {
	leadsInApp: true,
	leadsEmail: true,
	teamInApp: true,
	teamEmail: true,
	analyticsInApp: true,
	analyticsEmail: false,
	securityInApp: true,
	securityEmail: true,
};

async function getUserPreferences(userId: string): Promise<UserPreferences> {
	const prefs = await db.notificationPreference.findUnique({
		where: { userId },
	});

	if (!prefs) {
		return DEFAULT_PREFERENCES;
	}

	return {
		leadsInApp: prefs.leadsInApp,
		leadsEmail: prefs.leadsEmail,
		teamInApp: prefs.teamInApp,
		teamEmail: prefs.teamEmail,
		analyticsInApp: prefs.analyticsInApp,
		analyticsEmail: prefs.analyticsEmail,
		securityInApp: prefs.securityInApp,
		securityEmail: prefs.securityEmail,
	};
}

function shouldSendInApp(
	prefs: UserPreferences,
	category: NotificationCategory,
): boolean {
	const key = `${category}InApp` as keyof UserPreferences;
	return prefs[key];
}

function shouldSendEmail(
	prefs: UserPreferences,
	category: NotificationCategory,
): boolean {
	const key = `${category}Email` as keyof UserPreferences;
	return prefs[key];
}

/**
 * Send a notification to a single user (in-app and/or email based on preferences)
 */
export async function sendNotification(
	payload: NotificationPayload,
): Promise<void> {
	const {
		userId,
		category,
		type,
		title,
		message,
		link,
		emailTemplateId,
		emailContext,
		emailSubject,
		emailHtml,
	} = payload;

	try {
		const prefs = await getUserPreferences(userId);

		// Create in-app notification if enabled
		if (shouldSendInApp(prefs, category)) {
			await db.notification.create({
				data: {
					id: createId(),
					userId,
					type,
					category,
					title,
					message,
					link: link ?? null,
				},
			});
		}

		// Queue email notification if enabled
		if (shouldSendEmail(prefs, category)) {
			const user = await db.user.findUnique({
				where: { id: userId },
				select: { email: true, locale: true },
			});

			if (user?.email) {
				const locale = (user.locale as "en" | "de") ?? "en";

				if (emailTemplateId && emailContext) {
					await queueTemplateEmail({
						to: user.email,
						locale,
						templateId: emailTemplateId,
						context: emailContext,
					});
				} else if (emailSubject) {
					await queueSimpleEmail({
						to: user.email,
						subject: emailSubject,
						locale,
						...(emailHtml !== undefined && { html: emailHtml }),
					});
				}
			}
		}
	} catch (error) {
		logger.error("Failed to send notification", {
			userId,
			category,
			error,
		});
	}
}

/**
 * Send notifications to multiple users
 */
export async function sendBulkNotification(
	userIds: string[],
	payload: Omit<NotificationPayload, "userId">,
): Promise<void> {
	await Promise.all(
		userIds.map((userId) => sendNotification({ ...payload, userId })),
	);
}

/**
 * Send a notification to all members of an organization
 */
export async function sendOrganizationNotification(
	organizationId: string,
	payload: Omit<NotificationPayload, "userId">,
	excludeUserIds?: string[],
): Promise<void> {
	const members = await db.member.findMany({
		where: { organizationId },
		select: { userId: true },
	});

	const userIds = members
		.map((m) => m.userId)
		.filter((id) => !excludeUserIds?.includes(id));

	if (userIds.length > 0) {
		await sendBulkNotification(userIds, payload);
	}
}
