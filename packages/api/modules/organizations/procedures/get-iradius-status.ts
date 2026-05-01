import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

/**
 * Lightweight read of `Organization.iradiusDisabled` for the current user's
 * org. Used by the UI to hide iRadius-only controls (Import from iRadius,
 * iRadius settings, account-type change preview) for orgs that have opted
 * out of the legacy integration.
 *
 * Permission: any member of the org (no specific permission required —
 * this is a UI capability flag, not data access).
 */
export const getOrganizationIradiusStatus = protectedProcedure
	.route({
		method: "GET",
		path: "/organizations/iradius-status",
		tags: ["Organizations"],
		summary:
			"Whether iRadius integration is disabled for this organization",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		const member = await verifyOrganizationMembership(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "You must be a member of this organization",
			});
		}
		const org = await db.organization.findUnique({
			where: { id: input.organizationId },
			select: { iradiusDisabled: true },
		});
		return { iradiusDisabled: org?.iradiusDisabled === true };
	});
