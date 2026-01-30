import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import {
	getPermissionContext,
	verifyPermission,
} from "@repo/api/lib/permission";
import { getAuditContextFromHeaders, webhookAudit } from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const deleteWebhook = protectedProcedure
	.route({
		method: "DELETE",
		path: "/webhooks/{id}",
		tags: ["Webhooks"],
		summary: "Delete a webhook",
		description: "Delete a webhook and all its delivery history",
	})
	.input(
		z.object({
			id: z.string(),
		}),
	)
	.handler(async ({ context: { user, headers }, input: { id } }) => {
		const webhook = await db.webhook.findUnique({
			where: { id },
			select: {
				id: true,
				url: true,
				organizationId: true,
			},
		});

		if (!webhook) {
			throw new ORPCError("NOT_FOUND", { message: "Webhook not found" });
		}

		const membership = await verifyOrganizationMembership(
			webhook.organizationId,
			user.id,
		);

		if (!membership) {
			throw new ORPCError("FORBIDDEN", {
				message: "You must be a member of this organization",
			});
		}

		// Check webhook delete permission
		const permContext = getPermissionContext(
			user.id,
			webhook.organizationId,
			membership.role,
		);
		verifyPermission(permContext, "webhooks", "delete");

		await db.webhook.delete({
			where: { id },
		});

		// Audit log the webhook deletion
		const auditContext = getAuditContextFromHeaders(headers);
		webhookAudit.deleted(
			webhook.id,
			user.id,
			webhook.organizationId,
			auditContext,
			{ url: webhook.url },
		);

		return { success: true };
	});
