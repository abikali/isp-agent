import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const getDealerStats = protectedProcedure
	.route({
		method: "GET",
		path: "/dealers/stats",
		tags: ["Dealers"],
		summary: "Get dealer dashboard statistics",
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

		const [total, active, inactive] = await Promise.all([
			db.ispDealer.count({ where: { organizationId } }),
			db.ispDealer.count({
				where: { organizationId, status: "ACTIVE" },
			}),
			db.ispDealer.count({
				where: { organizationId, status: "INACTIVE" },
			}),
		]);

		return {
			total,
			active,
			inactive,
		};
	});
