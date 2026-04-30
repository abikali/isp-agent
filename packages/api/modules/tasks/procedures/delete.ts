import { ORPCError } from "@orpc/server";
import {
	requirePermission,
	verifyTaskOwnership,
} from "@repo/api/lib/permission";
import { getAuditContextFromHeaders, taskAudit } from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { taskInDealerScope } from "../lib/dealer-scope";

export const deleteTask = protectedProcedure
	.route({
		method: "POST",
		path: "/tasks/delete",
		tags: ["Tasks"],
		summary: "Soft delete a task (set CANCELLED)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const { permCtx, activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"tasks",
			"delete",
		);

		const existing = await db.task.findFirst({
			where: { id: input.id, organizationId: input.organizationId },
			include: {
				assignments: {
					select: {
						employeeId: true,
						employee: { select: { id: true, dealerId: true } },
					},
				},
				customer: { select: { dealerId: true } },
			},
		});
		if (!existing || !taskInDealerScope(existing, activeDealerId)) {
			throw new ORPCError("NOT_FOUND", {
				message: "Task not found",
			});
		}

		await verifyTaskOwnership(permCtx, "delete", existing);

		await db.task.update({
			where: { id: input.id },
			data: { status: "CANCELLED" },
		});

		const auditContext = getAuditContextFromHeaders(headers);
		taskAudit.deleted(
			input.id,
			user.id,
			input.organizationId,
			auditContext,
		);

		return { success: true };
	});
