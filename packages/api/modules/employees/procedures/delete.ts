import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import {
	employeeAudit,
	getAuditContextFromHeaders,
} from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const deleteEmployee = protectedProcedure
	.route({
		method: "POST",
		path: "/employees/delete",
		tags: ["Employees"],
		summary: "Soft delete an employee (set INACTIVE)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"employees",
			"delete",
		);

		const existing = await db.employee.findFirst({
			where: {
				id: input.id,
				organizationId: input.organizationId,
				...getDealerScopeFilter(activeDealerId),
			},
		});
		if (!existing) {
			throw new ORPCError("NOT_FOUND", {
				message: "Employee not found",
			});
		}

		await db.employee.update({
			where: { id: input.id },
			data: { status: "INACTIVE" },
		});

		const auditContext = getAuditContextFromHeaders(headers);
		employeeAudit.deleted(
			input.id,
			user.id,
			input.organizationId,
			auditContext,
		);

		return { success: true };
	});
