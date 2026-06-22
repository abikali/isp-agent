import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { getAuditContextFromHeaders, taskAudit } from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import { sendWhatsAppMaintenanceVisit } from "@repo/jobs";
import { logger } from "@repo/logs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const createTask = protectedProcedure
	.route({
		method: "POST",
		path: "/tasks",
		tags: ["Tasks"],
		summary: "Create a new task",
	})
	.input(
		z.object({
			organizationId: z.string(),
			title: z.string().min(1).max(500),
			description: z.string().max(5000).optional(),
			priority: z
				.enum(["LOW", "MEDIUM", "HIGH", "URGENT"])
				.default("MEDIUM"),
			status: z
				.enum([
					"OPEN",
					"IN_PROGRESS",
					"ON_HOLD",
					"COMPLETED",
					"CANCELLED",
				])
				.default("OPEN"),
			category: z
				.enum([
					"INSTALLATION",
					"MAINTENANCE",
					"REPLACEMENT",
					"REPAIR",
					"SUPPORT",
					"BILLING",
					"GENERAL",
					"UNINSTALL",
				])
				.default("GENERAL"),
			dueDate: z.coerce.date().optional(),
			notes: z.string().max(5000).optional(),
			customerId: z.string().optional(),
			stationId: z.string().optional(),
			employeeIds: z.array(z.string()).optional(),
			// Maintenance-visit WhatsApp to the customer (legacy parity)
			notifyCustomerWhatsApp: z.boolean().optional(),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"tasks",
			"create",
		);

		const dealerFilter = getDealerScopeFilter(activeDealerId);

		if (input.customerId) {
			const customer = await db.customer.findFirst({
				where: {
					id: input.customerId,
					organizationId: input.organizationId,
					...dealerFilter,
				},
				select: { id: true },
			});
			if (!customer) {
				throw new ORPCError("FORBIDDEN", {
					message: "Customer does not belong to your dealer",
				});
			}
		}

		if (input.employeeIds?.length) {
			const validCount = await db.employee.count({
				where: {
					id: { in: input.employeeIds },
					organizationId: input.organizationId,
					...dealerFilter,
				},
			});
			if (validCount !== input.employeeIds.length) {
				throw new ORPCError("FORBIDDEN", {
					message:
						"One or more employees do not belong to your dealer",
				});
			}
		}

		const task = await db.task.create({
			data: {
				organizationId: input.organizationId,
				title: input.title,
				description: input.description ?? null,
				priority: input.priority,
				status: input.status,
				category: input.category,
				dueDate: input.dueDate ?? null,
				notes: input.notes ?? null,
				createdById: user.id,
				customerId: input.customerId ?? null,
				stationId: input.stationId ?? null,
				completedAt: input.status === "COMPLETED" ? new Date() : null,
				...(input.employeeIds?.length
					? {
							assignments: {
								create: input.employeeIds.map((employeeId) => ({
									employeeId,
								})),
							},
						}
					: {}),
			},
			select: {
				id: true,
				title: true,
				status: true,
				priority: true,
				category: true,
				createdAt: true,
			},
		});

		const auditContext = getAuditContextFromHeaders(headers);
		taskAudit.created(
			task.id,
			user.id,
			input.organizationId,
			auditContext,
			{ title: input.title },
		);

		// Fire-and-forget: tell the customer a maintenance visit is coming
		if (input.notifyCustomerWhatsApp && input.customerId) {
			(async () => {
				const [customer, worker] = await Promise.all([
					db.customer.findFirst({
						where: { id: input.customerId as string },
						select: { firstName: true, mobile: true },
					}),
					input.employeeIds?.[0]
						? db.employee.findFirst({
								where: { id: input.employeeIds[0] },
								select: { name: true, phone: true },
							})
						: Promise.resolve(null),
				]);
				if (customer?.mobile) {
					await sendWhatsAppMaintenanceVisit({
						phone: customer.mobile,
						customerName: customer.firstName,
						workerName: worker?.name ?? null,
						workerPhone: worker?.phone ?? null,
					});
				}
			})().catch((err: unknown) =>
				logger.warn("[Task Create] customer WhatsApp failed", {
					error: String(err),
				}),
			);
		}

		return { task };
	});
