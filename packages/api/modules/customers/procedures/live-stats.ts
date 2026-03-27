import { requirePermission } from "@repo/api/lib/permission";
import { queryIRadiusLiveStats } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const getLiveStats = protectedProcedure
	.route({
		method: "GET",
		path: "/customers/live-stats",
		tags: ["Customers"],
		summary:
			"Get real-time stats from iRadius (online/offline/active counts)",
	})
	.input(
		z.object({
			organizationId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input: { organizationId } }) => {
		await requirePermission(organizationId, user.id, "customers", "read");

		const liveStats = await queryIRadiusLiveStats();

		if (!liveStats) {
			return {
				available: false as const,
				online: 0,
				offline: 0,
				active: 0,
				inactive: 0,
				expired: 0,
				fup: 0,
				archived: 0,
				totalSubscribers: 0,
			};
		}

		return {
			available: true as const,
			...liveStats,
		};
	});
