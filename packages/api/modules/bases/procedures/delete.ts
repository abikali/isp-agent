import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { baseAudit, getAuditContextFromHeaders } from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const deleteBase = protectedProcedure
	.route({
		method: "POST",
		path: "/bases/delete",
		tags: ["Bases"],
		summary: "Delete a base",
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
			"bases",
			"delete",
		);

		const existing = await db.base.findFirst({
			where: {
				id: input.id,
				organizationId: input.organizationId,
				...getDealerScopeFilter(activeDealerId),
			},
			select: { id: true },
		});
		if (!existing) {
			throw new ORPCError("NOT_FOUND", { message: "Base not found" });
		}

		// Worker assignments (base_employee) cascade-delete with the base.
		await db.base.delete({ where: { id: input.id } });

		const auditContext = getAuditContextFromHeaders(headers);
		baseAudit.deleted(
			input.id,
			user.id,
			input.organizationId,
			auditContext,
		);

		return { success: true };
	});
