import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { isSystemRole } from "@repo/auth/permissions";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

/**
 * Reassign members from one custom role name to another.
 *
 * Better Auth's `updateRole` renames the `organization_role` row but does NOT
 * cascade to `member.role`. Since permissions are resolved by matching
 * `member.role` against `OrganizationRole.role`, a rename without this cascade
 * would orphan every assigned member (they'd silently lose all permissions).
 * The Edit Role dialog calls this right after a successful rename.
 */
export const reassignRoleMembers = protectedProcedure
	.route({
		method: "POST",
		path: "/organizations/roles/reassign-members",
		tags: ["Organizations"],
		summary: "Reassign members from one role name to another",
	})
	.input(
		z.object({
			organizationId: z.string(),
			fromRole: z.string().min(1),
			toRole: z.string().min(1),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		// Same gate Better Auth enforces for updating a role.
		await requirePermission(input.organizationId, user.id, "ac", "update");

		// Never rewrite protected system roles (owner/admin/member).
		if (isSystemRole(input.fromRole) || isSystemRole(input.toRole)) {
			throw new ORPCError("BAD_REQUEST", {
				message: "System roles cannot be reassigned",
			});
		}

		const { count } = await db.member.updateMany({
			where: {
				organizationId: input.organizationId,
				role: input.fromRole,
			},
			data: { role: input.toRole },
		});

		return { count };
	});
