import {
	getDealerScopeViaCustomer,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { paginationSchema } from "../lib/schemas";

/**
 * Delivery log of customer payment notifications — the daily expiry
 * reminders and the pending-stop notices — one row per (message, channel),
 * newest first.
 */
export const listCustomerNotifications = protectedProcedure
	.route({
		method: "GET",
		path: "/billing/notifications",
		tags: ["Billing"],
		summary:
			"List customer payment notifications (reminders, stop notices)",
	})
	.input(
		z
			.object({
				organizationId: z.string(),
				customerId: z.string().optional(),
				kind: z.enum(["expiry_reminder", "stop_notice"]).optional(),
				channel: z.enum(["whatsapp", "sms"]).optional(),
				status: z
					.enum(["queued", "sent", "failed", "skipped"])
					.optional(),
			})
			.merge(paginationSchema(50)),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"view",
		);

		const where = {
			organizationId: input.organizationId,
			...getDealerScopeViaCustomer(activeDealerId),
			...(input.customerId ? { customerId: input.customerId } : {}),
			...(input.kind ? { kind: input.kind } : {}),
			...(input.channel ? { channel: input.channel } : {}),
			...(input.status ? { status: input.status } : {}),
		};

		const [notifications, total] = await Promise.all([
			db.customerNotification.findMany({
				where,
				select: {
					id: true,
					kind: true,
					channel: true,
					phone: true,
					contactPhone: true,
					status: true,
					error: true,
					attempts: true,
					sentAt: true,
					createdAt: true,
					sentById: true,
					invoice: {
						select: { year: true, month: true, expiryDate: true },
					},
					customer: {
						select: {
							id: true,
							firstName: true,
							lastName: true,
							username: true,
						},
					},
				},
				orderBy: { createdAt: "desc" },
				skip: (input.page - 1) * input.pageSize,
				take: input.pageSize,
			}),
			db.customerNotification.count({ where }),
		]);

		return {
			notifications,
			total,
			page: input.page,
			pageSize: input.pageSize,
			totalPages: Math.ceil(total / input.pageSize),
		};
	});
