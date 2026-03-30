import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { getAuditContextFromHeaders, taskAudit } from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const assignEmployees = protectedProcedure
	.route({
		method: "POST",
		path: "/tasks/assign-employees",
		tags: ["Tasks"],
		summary: "Replace employee assignments for a task",
	})
	.input(
		z.object({
			organizationId: z.string(),
			taskId: z.string(),
			employeeIds: z.array(z.string()),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"tasks",
			"assign",
		);

		const existing = await db.task.findFirst({
			where: {
				id: input.taskId,
				organizationId: input.organizationId,
			},
			include: {
				customer: { select: { dealerId: true } },
			},
		});
		if (!existing) {
			throw new ORPCError("NOT_FOUND", {
				message: "Task not found",
			});
		}

		// Dealer scoping: if task has a customer, it must belong to the active dealer
		if (
			existing.customerId &&
			existing.customer?.dealerId !== (activeDealerId ?? null)
		) {
			throw new ORPCError("NOT_FOUND", {
				message: "Task not found",
			});
		}

		// Verify employees belong to active dealer
		if (input.employeeIds.length > 0) {
			const validCount = await db.employee.count({
				where: {
					id: { in: input.employeeIds },
					organizationId: input.organizationId,
					dealerId: activeDealerId ?? null,
				},
			});
			if (validCount !== input.employeeIds.length) {
				throw new ORPCError("FORBIDDEN", {
					message:
						"One or more employees do not belong to your dealer",
				});
			}
		}

		await db.$transaction([
			db.taskAssignment.deleteMany({
				where: { taskId: input.taskId },
			}),
			...input.employeeIds.map((employeeId) =>
				db.taskAssignment.create({
					data: {
						taskId: input.taskId,
						employeeId,
					},
				}),
			),
		]);

		const auditContext = getAuditContextFromHeaders(headers);
		taskAudit.employeesAssigned(
			input.taskId,
			user.id,
			input.organizationId,
			auditContext,
			{ employeeIds: input.employeeIds },
		);

		return { success: true };
	});
