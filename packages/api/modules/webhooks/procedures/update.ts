import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import {
	getPermissionContext,
	verifyPermission,
} from "@repo/api/lib/permission";
import { getAuditContextFromHeaders, webhookAudit } from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import { validateWebhookUrl } from "@repo/utils";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { WebhookEventSchema } from "../types";

export const updateWebhook = protectedProcedure
	.route({
		method: "PUT",
		path: "/webhooks/{id}",
		tags: ["Webhooks"],
		summary: "Update a webhook",
		description: "Update a webhook's URL, events, or enabled status",
	})
	.input(
		z.object({
			id: z.string(),
			url: z.string().url().optional(),
			events: z.array(WebhookEventSchema).min(1).optional(),
			enabled: z.boolean().optional(),
		}),
	)
	.handler(
		async ({
			context: { user, headers },
			input: { id, url, events, enabled },
		}) => {
			const webhook = await db.webhook.findUnique({
				where: { id },
				select: {
					id: true,
					organizationId: true,
				},
			});

			if (!webhook) {
				throw new ORPCError("NOT_FOUND", {
					message: "Webhook not found",
				});
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

			// Check webhook update permission
			const permContext = getPermissionContext(
				user.id,
				webhook.organizationId,
				membership.role,
			);
			verifyPermission(permContext, "webhooks", "update");

			// Validate webhook URL is not internal/private (SSRF prevention)
			if (url) {
				const urlError = validateWebhookUrl(url);
				if (urlError) {
					throw new ORPCError("BAD_REQUEST", {
						message: urlError,
					});
				}
			}

			const updated = await db.webhook.update({
				where: { id },
				data: {
					...(url !== undefined && { url }),
					...(events !== undefined && { events }),
					...(enabled !== undefined && { enabled }),
				},
				select: {
					id: true,
					url: true,
					events: true,
					enabled: true,
					createdAt: true,
					updatedAt: true,
				},
			});

			// Audit log the webhook update
			const changedFields: string[] = [];
			if (url !== undefined) {
				changedFields.push("url");
			}
			if (events !== undefined) {
				changedFields.push("events");
			}
			if (enabled !== undefined) {
				changedFields.push("enabled");
			}

			const auditContext = getAuditContextFromHeaders(headers);
			webhookAudit.updated(
				webhook.id,
				user.id,
				webhook.organizationId,
				auditContext,
				{ changedFields },
			);

			return updated;
		},
	);
