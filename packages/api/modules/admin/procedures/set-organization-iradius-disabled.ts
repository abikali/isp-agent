import { ORPCError } from "@orpc/server";
import { db } from "@repo/database";
import z from "zod";
import { adminProcedure } from "../../../orpc/procedures";

/**
 * Toggle `Organization.iradiusDisabled`. When set to true, every iRadius
 * surface refuses for the org (mirror writes skip remote, sync/push
 * workers bail, UI hides iRadius controls). See `mirrorToIRadius` and
 * the worker guards for the full enforcement set.
 */
export const setOrganizationIradiusDisabled = adminProcedure
	.route({
		method: "POST",
		path: "/admin/organizations/{id}/iradius-disabled",
		tags: ["Administration"],
		summary: "Enable or disable iRadius integration for an organization",
	})
	.input(
		z.object({
			id: z.string(),
			disabled: z.boolean(),
		}),
	)
	.handler(async ({ input }) => {
		const exists = await db.organization.findUnique({
			where: { id: input.id },
			select: { id: true },
		});
		if (!exists) {
			throw new ORPCError("NOT_FOUND", {
				message: "Organization not found",
			});
		}
		const updated = await db.organization.update({
			where: { id: input.id },
			data: { iradiusDisabled: input.disabled },
			select: { id: true, iradiusDisabled: true },
		});
		return updated;
	});
