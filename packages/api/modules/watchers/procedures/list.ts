import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const list = protectedProcedure
	.route({
		method: "GET",
		path: "/watchers",
		tags: ["Watchers"],
		summary: "List watchers for an organization",
	})
	.input(
		z.object({
			organizationId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input: { organizationId } }) => {
		const member = await verifyOrganizationMembership(
			organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "You must be a member of this organization",
			});
		}

		const watchers = await db.watcher.findMany({
			where: { organizationId },
			select: {
				id: true,
				name: true,
				type: true,
				target: true,
				intervalSeconds: true,
				enabled: true,
				status: true,
				lastCheckedAt: true,
				lastStatusChange: true,
				consecutiveFails: true,
				createdAt: true,
			},
			orderBy: { createdAt: "desc" },
		});

		return { watchers };
	});
