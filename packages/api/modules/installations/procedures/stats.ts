import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const getInstallationStats = protectedProcedure
	.route({
		method: "GET",
		path: "/installations/stats",
		tags: ["Installations"],
		summary: "Installation queue statistics",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"installations",
			"read",
		);

		const dealerScope = getDealerScopeFilter(activeDealerId);
		const [pending, pendingValue] = await Promise.all([
			db.installation.count({
				where: {
					organizationId: input.organizationId,
					status: "PENDING",
					employee: dealerScope,
				},
			}),
			db.installation.findMany({
				where: {
					organizationId: input.organizationId,
					status: "PENDING",
					employee: dealerScope,
				},
				select: { price: true, quantity: true },
			}),
		]);

		return {
			pendingCount: pending,
			pendingValue: pendingValue.reduce(
				(sum, i) => sum + i.price * i.quantity,
				0,
			),
		};
	});
