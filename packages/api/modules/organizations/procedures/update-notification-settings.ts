import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

/**
 * Update the org-level notification & automation toggles. Only the fields
 * provided are written, so the page can patch a single switch. Gated by the
 * `organization:update` permission.
 */
export const updateNotificationSettings = protectedProcedure
	.route({
		method: "POST",
		path: "/organizations/notification-settings",
		tags: ["Organizations"],
		summary: "Update organization notification & automation settings",
	})
	.input(
		z.object({
			organizationId: z.string(),
			stoppedPaymentTaskEnabled: z.boolean().optional(),
			stoppedPaymentNotifyEnabled: z.boolean().optional(),
			adminTelegramChatId: z.string().max(100).nullable().optional(),
			alertOnWorkerRequest: z.boolean().optional(),
			alertOnPaymentCollected: z.boolean().optional(),
			alertOnInstallationDone: z.boolean().optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"organization",
			"update",
		);

		const data: Record<string, boolean | string | null> = {};
		if (input.stoppedPaymentTaskEnabled !== undefined) {
			data["stoppedPaymentTaskEnabled"] = input.stoppedPaymentTaskEnabled;
		}
		if (input.stoppedPaymentNotifyEnabled !== undefined) {
			data["stoppedPaymentNotifyEnabled"] =
				input.stoppedPaymentNotifyEnabled;
		}
		if (input.adminTelegramChatId !== undefined) {
			data["adminTelegramChatId"] =
				input.adminTelegramChatId?.trim() || null;
		}
		if (input.alertOnWorkerRequest !== undefined) {
			data["alertOnWorkerRequest"] = input.alertOnWorkerRequest;
		}
		if (input.alertOnPaymentCollected !== undefined) {
			data["alertOnPaymentCollected"] = input.alertOnPaymentCollected;
		}
		if (input.alertOnInstallationDone !== undefined) {
			data["alertOnInstallationDone"] = input.alertOnInstallationDone;
		}

		const updated = await db.organization.update({
			where: { id: input.organizationId },
			data,
			select: {
				stoppedPaymentTaskEnabled: true,
				stoppedPaymentNotifyEnabled: true,
				adminTelegramChatId: true,
				alertOnWorkerRequest: true,
				alertOnPaymentCollected: true,
				alertOnInstallationDone: true,
			},
		});

		return updated;
	});
