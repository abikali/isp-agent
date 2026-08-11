import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
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
import { notifyTaskWorkers } from "../lib/notify-task-workers";
import { buildTaskTitle, taskTitleCode } from "../lib/task-title";

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
			// Optional: the UI never sends one. Titles are derived from the
			// category and the target — see lib/task-title.ts. API callers may
			// still pass their own.
			title: z.string().min(1).max(500).optional(),
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
			baseId: z.string().optional(),
			employeeIds: z.array(z.string()).optional(),
			// Maintenance-visit WhatsApp to the customer (legacy parity)
			notifyCustomerWhatsApp: z.boolean().optional(),
			// Add-ons (IPTV / Real IP) the worker should set up on this visit.
			requestedAddons: z.array(z.enum(["IPTV", "REAL_IP"])).optional(),
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

		// Add-ons attach to a customer (iRadius account), never a base/station.
		const requestedAddons = [...new Set(input.requestedAddons ?? [])];
		if (requestedAddons.length > 0 && !input.customerId) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Add-ons require the task to target a customer",
			});
		}

		// Doubles as the title source — the target names come from the same
		// lookups that authorize the task.
		let target: string | null = null;

		if (input.customerId) {
			const customer = await db.customer.findFirst({
				where: {
					id: input.customerId,
					organizationId: input.organizationId,
					...dealerFilter,
				},
				select: {
					id: true,
					firstName: true,
					lastName: true,
					username: true,
				},
			});
			if (!customer) {
				throw new ORPCError("FORBIDDEN", {
					message: "Customer does not belong to your dealer",
				});
			}
			target =
				[customer.firstName, customer.lastName]
					.filter(Boolean)
					.join(" ") ||
				customer.username ||
				null;
		}

		if (input.baseId) {
			const base = await db.base.findFirst({
				where: {
					id: input.baseId,
					organizationId: input.organizationId,
					...dealerFilter,
				},
				select: { id: true, name: true },
			});
			if (!base) {
				throw new ORPCError("FORBIDDEN", {
					message: "Base does not belong to your dealer",
				});
			}
			target ??= base.name;
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

		// Generate the id up front so the title can carry its short code.
		const taskId = createId();
		const title =
			input.title?.trim() ||
			buildTaskTitle({
				category: input.category,
				target,
				code: taskTitleCode(taskId),
			});

		const task = await db.task.create({
			data: {
				id: taskId,
				organizationId: input.organizationId,
				title,
				description: input.description ?? null,
				priority: input.priority,
				status: input.status,
				category: input.category,
				dueDate: input.dueDate ?? null,
				notes: input.notes ?? null,
				createdById: user.id,
				customerId: input.customerId ?? null,
				stationId: input.stationId ?? null,
				baseId: input.baseId ?? null,
				requestedAddons,
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
			{ title },
		);

		// Fire-and-forget: tell the assigned workers they have a new task
		if (input.employeeIds?.length) {
			const dueDetail = input.dueDate
				? `Due ${input.dueDate.toISOString().slice(0, 10)}`
				: undefined;
			notifyTaskWorkers({
				organizationId: input.organizationId,
				taskId: task.id,
				taskTitle: task.title,
				employeeIds: input.employeeIds,
				event: "assigned",
				...(dueDetail ? { detail: dueDetail } : {}),
			});
		}

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
