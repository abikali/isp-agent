import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
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
		const member = await verifyOrganizationMembership(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "You must be a member of this organization",
			});
		}

		const existing = await db.task.findFirst({
			where: {
				id: input.taskId,
				organizationId: input.organizationId,
			},
		});
		if (!existing) {
			throw new ORPCError("NOT_FOUND", {
				message: "Task not found",
			});
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
