import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { customerNotificationsAllowed } from "@repo/jobs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

/**
 * Read the org-level notification & automation toggles surfaced on the
 * Notifications settings page. Gated by the `organization:update` permission
 * (same bar as editing other org settings).
 */
export const getNotificationSettings = protectedProcedure
	.route({
		method: "GET",
		path: "/organizations/notification-settings",
		tags: ["Organizations"],
		summary: "Get organization notification & automation settings",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"organization",
			"update",
		);

		const org = await db.organization.findUnique({
			where: { id: input.organizationId },
			select: {
				stoppedPaymentTaskEnabled: true,
				stoppedPaymentNotifyEnabled: true,
				adminTelegramChatId: true,
				alertOnWorkerRequest: true,
				alertOnPaymentCollected: true,
				alertOnInstallationDone: true,
				notifyWorkerOnTaskAssigned: true,
				notifyWorkerOnTaskUpdated: true,
				notifyWorkerOnTaskCancelled: true,
				expiryReminderAllowed: true,
				isWholesaleOperator: true,
				expiryReminderEnabled: true,
				expiryReminderSms: true,
				expiryReminderWhatsapp: true,
				reminderFallbackPhone: true,
			},
		});

		if (!org) {
			throw new ORPCError("NOT_FOUND", {
				message: "Organization not found",
			});
		}

		const { isWholesaleOperator, expiryReminderAllowed, ...settings } = org;
		return {
			...settings,
			// Read-only here: granted by the wholesale operator from its
			// dealer page; the operator org itself is always allowed.
			expiryReminderAllowed: customerNotificationsAllowed({
				isWholesaleOperator,
				expiryReminderAllowed,
			}),
			reminderLastRun: await lastReminderRun(input.organizationId),
		};
	});

/**
 * Outcome of the latest daily reminder run (rows created in the 24h before
 * the newest reminder row), for the "Payment reminders" card.
 */
async function lastReminderRun(organizationId: string) {
	const latest = await db.customerNotification.findFirst({
		where: { organizationId, kind: "expiry_reminder" },
		orderBy: { createdAt: "desc" },
		select: { createdAt: true },
	});
	if (!latest) {
		return null;
	}
	const since = new Date(latest.createdAt.getTime() - 24 * 60 * 60 * 1000);
	const where = {
		organizationId,
		kind: "expiry_reminder",
		createdAt: { gt: since },
	};
	const [byStatus, skipReasons] = await Promise.all([
		db.customerNotification.groupBy({
			by: ["status"],
			where,
			_count: { _all: true },
		}),
		db.customerNotification.groupBy({
			by: ["error"],
			where: { ...where, status: "skipped" },
			_count: { _all: true },
			orderBy: { _count: { error: "desc" } },
			take: 5,
		}),
	]);
	const count = (status: string) =>
		byStatus.find((row) => row.status === status)?._count._all ?? 0;
	return {
		at: latest.createdAt,
		sent: count("sent"),
		failed: count("failed"),
		queued: count("queued"),
		skipped: count("skipped"),
		skipReasons: skipReasons.map((row) => ({
			reason: row.error ?? "unknown",
			count: row._count._all,
		})),
	};
}
