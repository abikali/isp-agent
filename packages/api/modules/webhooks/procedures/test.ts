import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import {
	getPermissionContext,
	verifyPermission,
} from "@repo/api/lib/permission";
import { getAuditContextFromHeaders, webhookAudit } from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import { dispatchWebhooks, type WebhookEvent } from "@repo/webhooks";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const testWebhook = protectedProcedure
	.route({
		method: "POST",
		path: "/webhooks/{id}/test",
		tags: ["Webhooks"],
		summary: "Test a webhook",
		description: "Send a test event to a webhook endpoint",
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
				organizationId: true,
				events: true,
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

		// Check webhook update permission (testing is an update operation)
		const permContext = getPermissionContext(
			user.id,
			webhook.organizationId,
			membership.role,
		);
		verifyPermission(permContext, "webhooks", "update");

		// Use the first subscribed event, or a generic test event
		const testEvent = (webhook.events[0] ??
			"organization.updated") as WebhookEvent;

		const results = await dispatchWebhooks({
			organizationId: webhook.organizationId,
			event: testEvent,
			data: {
				test: true,
				message: "This is a test webhook",
				timestamp: new Date().toISOString(),
			},
		});

		const result = results.find((r) => r.webhookId === id);

		// Audit log the webhook test
		const auditContext = getAuditContextFromHeaders(headers);
		const testMetadata: { success?: boolean; statusCode?: number } = {
			success: result?.success ?? false,
		};
		if (result?.statusCode !== undefined) {
			testMetadata.statusCode = result.statusCode;
		}
		webhookAudit.tested(
			webhook.id,
			user.id,
			webhook.organizationId,
			auditContext,
			testMetadata,
		);

		return {
			success: result?.success ?? false,
			statusCode: result?.statusCode,
			error: result?.error,
		};
	});
