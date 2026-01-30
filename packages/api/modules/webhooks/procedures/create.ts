import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import {
	getPermissionContext,
	verifyPermission,
} from "@repo/api/lib/permission";
import { getAuditContextFromHeaders, webhookAudit } from "@repo/auth/lib/audit";
import { db, getOrganizationById } from "@repo/database";
import { validateWebhookUrl } from "@repo/utils";
import { generateWebhookSecret } from "@repo/webhooks";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { WebhookEventSchema } from "../types";

export const createWebhook = protectedProcedure
	.route({
		method: "POST",
		path: "/webhooks",
		tags: ["Webhooks"],
		summary: "Create a new webhook",
		description: "Create a new webhook endpoint for an organization",
	})
	.input(
		z.object({
			organizationId: z.string(),
			url: z.string().url(),
			events: z.array(WebhookEventSchema).min(1),
		}),
	)
	.handler(
		async ({
			context: { user, headers },
			input: { organizationId, url, events },
		}) => {
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

			if (!membership) {
				throw new ORPCError("FORBIDDEN", {
					message: "You must be a member of this organization",
				});
			}

			// Check webhook create permission
			const permContext = getPermissionContext(
				user.id,
				organizationId,
				membership.role,
			);
			verifyPermission(permContext, "webhooks", "create");

			// Validate webhook URL is not internal/private (SSRF prevention)
			const urlError = validateWebhookUrl(url);
			if (urlError) {
				throw new ORPCError("BAD_REQUEST", {
					message: urlError,
				});
			}

			// Generate a secret for this webhook
			const secret = generateWebhookSecret();

			const webhook = await db.webhook.create({
				data: {
					id: createId(),
					organizationId,
					url,
					events,
					secret,
					enabled: true,
					updatedAt: new Date(),
				},
				select: {
					id: true,
					url: true,
					events: true,
					enabled: true,
					createdAt: true,
				},
			});

			// Audit log the webhook creation
			const auditContext = getAuditContextFromHeaders(headers);
			webhookAudit.created(
				webhook.id,
				user.id,
				organizationId,
				auditContext,
				{
					url,
					events,
				},
			);

			// Return the secret only once - it cannot be retrieved later
			return {
				...webhook,
				secret, // Only shown once!
			};
		},
	);
