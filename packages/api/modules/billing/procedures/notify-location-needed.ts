import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { db } from "@repo/database";
import { queueTelegramLocationNotify } from "@repo/jobs";
import { logger } from "@repo/logs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const notifyLocationNeeded = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/location/notify-needed",
		tags: ["Billing"],
		summary:
			"Queue Telegram notification for collector to collect customer location",
	})
	.input(
		z.object({
			organizationId: z.string(),
			customerId: z.string(),
			employeeId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const member = await verifyOrganizationMembership(
			input.organizationId,
			user.id,
		);
		if (!member) {
			return { queued: false, reason: null };
		}

		const employee = await db.employee.findFirst({
			where: { id: input.employeeId },
			select: { telegramChatId: true },
		});

		if (!employee?.telegramChatId) {
			return { queued: false, reason: "no-telegram" as const };
		}

		queueTelegramLocationNotify({
			employeeId: input.employeeId,
			customerId: input.customerId,
			organizationId: input.organizationId,
		}).catch((err) =>
			logger.warn("[Notify Location Needed] Failed to queue job", {
				error: String(err),
			}),
		);

		return { queued: true, reason: null };
	});
