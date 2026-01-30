import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import {
	getPermissionContext,
	verifyPermission,
} from "@repo/api/lib/permission";
import { getAuditContextFromHeaders, webhookAudit } from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import { retryWebhookDelivery } from "@repo/webhooks";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const retryDelivery = protectedProcedure
	.route({
		method: "POST",
		path: "/webhooks/deliveries/{deliveryId}/retry",
		tags: ["Webhooks"],
		summary: "Retry a webhook delivery",
		description: "Retry a failed webhook delivery",
	})
	.input(
		z.object({
			deliveryId: z.string(),
		}),
	)
	.handler(async ({ context: { user, headers }, input: { deliveryId } }) => {
		const delivery = await db.webhookDelivery.findUnique({
			where: { id: deliveryId },
			include: {
				webhook: {
					select: {
						id: true,
						organizationId: true,
					},
				},
			},
		});

		if (!delivery) {
			throw new ORPCError("NOT_FOUND", { message: "Delivery not found" });
		}

		const membership = await verifyOrganizationMembership(
			delivery.webhook.organizationId,
			user.id,
		);

		if (!membership) {
			throw new ORPCError("FORBIDDEN", {
				message: "You must be a member of this organization",
			});
		}

		// Check webhook update permission (retrying is an update operation)
		const permContext = getPermissionContext(
			user.id,
			delivery.webhook.organizationId,
			membership.role,
		);
		verifyPermission(permContext, "webhooks", "update");

		if (delivery.deliveredAt) {
			throw new ORPCError("BAD_REQUEST", {
				message: "This delivery already succeeded",
			});
		}

		const result = await retryWebhookDelivery(deliveryId);

		// Audit log the webhook retry (using tested action)
		const auditContext = getAuditContextFromHeaders(headers);
		const retryMetadata: { success?: boolean; statusCode?: number } = {
			success: result.success,
		};
		if (result.statusCode !== undefined) {
			retryMetadata.statusCode = result.statusCode;
		}
		webhookAudit.tested(
			delivery.webhook.id,
			user.id,
			delivery.webhook.organizationId,
			auditContext,
			retryMetadata,
		);

		return result;
	});
