import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { getAuditContextFromHeaders, taskAudit } from "@repo/auth/lib/audit";
import { db } from "@repo/database";
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
					"REPAIR",
					"SUPPORT",
					"BILLING",
					"GENERAL",
				])
				.default("GENERAL"),
			dueDate: z.coerce.date().optional(),
			notes: z.string().max(5000).optional(),
			customerId: z.string().optional(),
			stationId: z.string().optional(),
			employeeIds: z.array(z.string()).optional(),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const member = await verifyOrganizationMembership(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "You must be a member of this organization",
			});
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

		return { task };
	});
