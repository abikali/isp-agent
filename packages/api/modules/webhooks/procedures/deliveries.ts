import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import {
	getPermissionContext,
	verifyPermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const listDeliveries = protectedProcedure
	.route({
		method: "GET",
		path: "/webhooks/{webhookId}/deliveries",
		tags: ["Webhooks"],
		summary: "List webhook deliveries",
		description: "List delivery history for a webhook",
	})
	.input(
		z.object({
			webhookId: z.string(),
			limit: z.number().min(1).max(100).optional().default(20),
			cursor: z.string().optional(),
		}),
	)
	.handler(
		async ({ context: { user }, input: { webhookId, limit, cursor } }) => {
			const webhook = await db.webhook.findUnique({
				where: { id: webhookId },
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

			// Check webhook read permission
			const permContext = getPermissionContext(
				user.id,
				webhook.organizationId,
				membership.role,
			);
			verifyPermission(permContext, "webhooks", "read");

			const deliveries = await db.webhookDelivery.findMany({
				where: { webhookId },
				take: limit + 1,
				...(cursor && {
					cursor: { id: cursor },
					skip: 1,
				}),
				orderBy: { createdAt: "desc" },
				select: {
					id: true,
					event: true,
					statusCode: true,
					attempts: true,
					deliveredAt: true,
					createdAt: true,
				},
			});

			let nextCursor: string | undefined;
			if (deliveries.length > limit) {
				const nextItem = deliveries.pop();
				nextCursor = nextItem?.id;
			}

			return {
				deliveries,
				nextCursor,
			};
		},
	);
