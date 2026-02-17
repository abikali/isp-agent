import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const get = protectedProcedure
	.route({
		method: "GET",
		path: "/watchers/{watcherId}",
		tags: ["Watchers"],
		summary: "Get a watcher with recent executions",
	})
	.input(
		z.object({
			organizationId: z.string(),
			watcherId: z.string(),
		}),
	)
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

		const watcher = await db.watcher.findFirst({
			where: {
				id: input.watcherId,
				organizationId: input.organizationId,
			},
			include: {
				executions: {
					orderBy: { createdAt: "desc" },
					take: 5,
				},
			},
		});

		if (!watcher) {
			throw new ORPCError("NOT_FOUND", {
				message: "Watcher not found",
			});
		}

		return { watcher };
	});
