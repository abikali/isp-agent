import { db } from "@repo/database";
import { queueTelegramNotify } from "@repo/jobs";
import { logger } from "@repo/logs";
import {
	notifyBadgeForOrganization,
	sendNotification,
	sendOrganizationNotification,
} from "@repo/notifications";

interface NotifyFieldEmployeeInput {
	organizationId: string;
	employeeId: string;
	title: string;
	message: string;
	link?: string;
	type?: "info" | "success" | "warning" | "error";
}

/**
 * Notify a field employee (worker/collector) about a workflow event.
 *
 * Sends an in-app notification when the employee has a linked auth user,
 * and a Telegram message when they have a chat ID. Fire-and-forget —
 * call without awaiting from procedure handlers.
 */
export async function notifyFieldEmployee(
	input: NotifyFieldEmployeeInput,
): Promise<void> {
	try {
		const employee = await db.employee.findFirst({
			where: {
				id: input.employeeId,
				organizationId: input.organizationId,
			},
			select: { userId: true, telegramChatId: true },
		});
		if (!employee) {
			return;
		}

		if (employee.userId) {
			await sendNotification({
				userId: employee.userId,
				category: "monitoring",
				type: input.type ?? "info",
				title: input.title,
				message: input.message,
				...(input.link !== undefined && { link: input.link }),
			});
			notifyBadgeForOrganization(input.organizationId);
		}

		if (employee.telegramChatId) {
			await queueTelegramNotify({
				organizationId: input.organizationId,
				employeeId: input.employeeId,
				text: `${input.title}\n\n${input.message}`,
			});
		}
	} catch (error) {
		logger.warn("[Notify Employee] Failed to send notification", {
			employeeId: input.employeeId,
			error: String(error),
		});
	}
}

interface NotifyOrgAdminsInput {
	organizationId: string;
	title: string;
	message: string;
	link?: string;
	type?: "info" | "success" | "warning" | "error";
	excludeUserIds?: string[];
}

/**
 * Notify all organization members about a pending review/approval event.
 * Fire-and-forget — call without awaiting from procedure handlers.
 */
export async function notifyOrgForReview(
	input: NotifyOrgAdminsInput,
): Promise<void> {
	try {
		await sendOrganizationNotification(
			input.organizationId,
			{
				category: "monitoring",
				type: input.type ?? "info",
				title: input.title,
				message: input.message,
				...(input.link !== undefined && { link: input.link }),
			},
			input.excludeUserIds,
		);
		notifyBadgeForOrganization(input.organizationId);
	} catch (error) {
		logger.warn("[Notify Org] Failed to send notification", {
			organizationId: input.organizationId,
			error: String(error),
		});
	}
}
