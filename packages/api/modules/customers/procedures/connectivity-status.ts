import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { z } from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

/**
 * Bulk connectivity status for a list of customer IDs.
 *
 * Customer list pages call this on a short refetch interval to keep the
 * online/offline dot fresh without re-loading the whole list. Returns just
 * the minimum fields so the request stays small.
 */
export const getConnectivityStatus = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/connectivity-status",
		tags: ["Customers"],
		summary: "Bulk-fetch online status for a list of customer IDs",
	})
	.input(
		z.object({
			organizationId: z.string(),
			customerIds: z.array(z.string()).min(1).max(200),
		}),
	)
	.handler(async ({ input, context: { user } }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"customers",
			"read",
		);

		const rows = await db.customer.findMany({
			where: {
				organizationId: input.organizationId,
				id: { in: input.customerIds },
			},
			select: {
				id: true,
				online: true,
				status: true,
				expiresAt: true,
			},
		});

		return { customers: rows };
	});
