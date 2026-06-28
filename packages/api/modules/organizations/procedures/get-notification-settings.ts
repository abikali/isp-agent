import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

/**
 * Read the org-level notification & automation toggles surfaced on the
 * Notifications settings page. Gated by the `organization:update` permission
 * (same bar as editing other org settings).
 */
export const getNotificationSettings = protectedProcedure
	.route({
		method: "GET",
		path: "/organizations/notification-settings",
		tags: ["Organizations"],
		summary: "Get organization notification & automation settings",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"organization",
			"update",
		);

		const org = await db.organization.findUnique({
			where: { id: input.organizationId },
			select: {
				stoppedPaymentTaskEnabled: true,
				stoppedPaymentNotifyEnabled: true,
			},
		});

		if (!org) {
			throw new ORPCError("NOT_FOUND", {
				message: "Organization not found",
			});
		}

		return org;
	});
