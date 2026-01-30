import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import {
	getPermissionContext,
	verifyPermission,
} from "@repo/api/lib/permission";
import { db, getOrganizationById } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const listWebhooks = protectedProcedure
	.route({
		method: "GET",
		path: "/webhooks",
		tags: ["Webhooks"],
		summary: "List webhooks",
		description: "List all webhooks for an organization",
	})
	.input(
		z.object({
			organizationId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input: { organizationId } }) => {
		const organization = await getOrganizationById(organizationId);

		if (!organization) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Organization not found",
			});
		}

		const membership = await verifyOrganizationMembership(
			organizationId,
			user.id,
		);

		// Only members can view webhooks
		if (!membership) {
			throw new ORPCError("FORBIDDEN", {
				message: "You must be a member of this organization",
			});
		}

		// Check webhook read permission
		const permContext = getPermissionContext(
			user.id,
			organizationId,
			membership.role,
		);
		verifyPermission(permContext, "webhooks", "read");

		const webhooks = await db.webhook.findMany({
			where: { organizationId },
			select: {
				id: true,
				url: true,
				events: true,
				enabled: true,
				createdAt: true,
				updatedAt: true,
				_count: {
					select: {
						deliveries: true,
					},
				},
			},
			orderBy: { createdAt: "desc" },
		});

		return { webhooks };
	});
