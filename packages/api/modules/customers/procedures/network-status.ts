import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

/**
 * Live online status for a customer's station + access point.
 *
 * Reads from the local `station` and `access_point` tables, both of which
 * are refreshed every 15 seconds by the scheduled `syncNetworkMonitor`
 * worker (see `packages/jobs/src/workers/scheduled.worker.ts`). That's
 * effectively live for a UI badge — far cheaper than re-opening an SSH
 * tunnel for every poll while still reflecting iRadius reality within
 * one refresh cycle.
 *
 * The customer edit page calls this with a 15s `refetchInterval` so
 * the badge flips automatically as devices come back online.
 */
export const getCustomerNetworkStatus = protectedProcedure
	.route({
		method: "GET",
		path: "/customers/network-status",
		tags: ["Customers"],
		summary: "Live online status for a customer's station and access point",
	})
	.input(
		z.object({
			organizationId: z.string(),
			customerId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"customers",
			"read",
		);

		const customer = await db.customer.findFirst({
			where: {
				id: input.customerId,
				organizationId: input.organizationId,
				...getDealerScopeFilter(activeDealerId),
			},
			select: {
				stationId: true,
				accessPointId: true,
			},
		});

		if (!customer) {
			throw new ORPCError("NOT_FOUND", {
				message: "Customer not found",
			});
		}

		// Fire both lookups in parallel; either may be null when the
		// customer isn't linked to a station/AP yet.
		const [station, accessPoint] = await Promise.all([
			customer.stationId
				? db.station.findUnique({
						where: { id: customer.stationId },
						select: {
							online: true,
							uptime: true,
							lastSyncedAt: true,
						},
					})
				: null,
			customer.accessPointId
				? db.accessPoint.findUnique({
						where: { id: customer.accessPointId },
						select: {
							online: true,
							uptime: true,
							signal: true,
							lastSyncedAt: true,
						},
					})
				: null,
		]);

		return {
			station,
			accessPoint,
		};
	});
