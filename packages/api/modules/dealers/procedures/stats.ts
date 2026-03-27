import { requirePermission } from "@repo/api/lib/permission";
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
		await requirePermission(organizationId, user.id, "dealers", "read");

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
