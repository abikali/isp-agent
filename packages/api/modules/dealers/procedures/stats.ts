import { db } from "@repo/database";
import z from "zod";
import { adminProcedure } from "../../../orpc/procedures";

export const getDealerStats = adminProcedure
	.route({
		method: "GET",
		path: "/admin/dealers/stats",
		tags: ["Dealers"],
		summary: "Get dealer dashboard statistics (admin only)",
	})
	.input(
		z.object({
			organizationId: z.string().optional(),
		}),
	)
	.handler(async ({ input: { organizationId } }) => {
		const base: Record<string, unknown> = {};

		if (organizationId) {
			base["organizationId"] = organizationId;
		}

		const [total, active, inactive] = await Promise.all([
			db.ispDealer.count({ where: base }),
			db.ispDealer.count({
				where: { ...base, status: "ACTIVE" },
			}),
			db.ispDealer.count({
				where: { ...base, status: "INACTIVE" },
			}),
		]);

		return {
			total,
			active,
			inactive,
		};
	});
