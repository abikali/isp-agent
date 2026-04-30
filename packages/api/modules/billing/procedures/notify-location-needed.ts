import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
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
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"customers",
			"update",
		);

		// Both lookups must hit the user's dealer scope; otherwise we'd be
		// pinging another dealer's employee about a customer they shouldn't see.
		const dealerFilter = getDealerScopeFilter(activeDealerId);

		const [customer, employee] = await Promise.all([
			db.customer.findFirst({
				where: {
					id: input.customerId,
					organizationId: input.organizationId,
					...dealerFilter,
				},
				select: { id: true },
			}),
			db.employee.findFirst({
				where: {
					id: input.employeeId,
					organizationId: input.organizationId,
					...dealerFilter,
				},
				select: { telegramChatId: true },
			}),
		]);
		if (!customer) {
			return { queued: false, reason: null };
		}
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
