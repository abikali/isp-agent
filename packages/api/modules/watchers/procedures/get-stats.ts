import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const getStats = protectedProcedure
	.route({
		method: "GET",
		path: "/watchers/stats",
		tags: ["Watchers"],
		summary: "Get watcher stats for an organization",
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

		const [total, up, down, unknown] = await Promise.all([
			db.watcher.count({ where: { organizationId } }),
			db.watcher.count({ where: { organizationId, status: "up" } }),
			db.watcher.count({ where: { organizationId, status: "down" } }),
			db.watcher.count({ where: { organizationId, status: "unknown" } }),
		]);

		return { total, up, down, unknown };
	});
