import {
	getDealerScopeViaCustomers,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const listStations = protectedProcedure
	.route({
		method: "GET",
		path: "/stations",
		tags: ["Stations"],
		summary: "List stations for an organization",
	})
	.input(
		z.object({
			organizationId: z.string(),
			search: z.string().optional(),
			online: z.boolean().optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"stations",
			"read",
		);

		const where: Record<string, unknown> = {
			organizationId: input.organizationId,
			// Hide stations soft-deleted by the iRadius sync cleanup.
			deletedAt: null,
		};

		if (input.online !== undefined) {
			where["online"] = input.online;
		}
		Object.assign(where, getDealerScopeViaCustomers(activeDealerId));
		if (input.search) {
			where["OR"] = [
				{ name: { contains: input.search, mode: "insensitive" } },
				{
					address: {
						contains: input.search,
						mode: "insensitive",
					},
				},
				{ host: { contains: input.search, mode: "insensitive" } },
			];
		}

		const stations = await db.station.findMany({
			where,
			select: {
				id: true,
				name: true,
				address: true,
				host: true,
				latitude: true,
				longitude: true,
				status: true,
				online: true,
				capacity: true,
				notes: true,
				createdAt: true,
				customers: {
					where: { dealerId: { not: null } },
					select: {
						dealer: { select: { id: true, name: true } },
					},
					distinct: ["dealerId"],
				},
				_count: {
					select: {
						customers: true,
						employees: true,
						accessPoints: true,
					},
				},
			},
			orderBy: { createdAt: "desc" },
		});

		// Extract unique dealers per station
		const result = stations.map((station) => {
			const dealerMap = new Map<string, string>();
			for (const c of station.customers) {
				if (c.dealer) {
					dealerMap.set(c.dealer.id, c.dealer.name);
				}
			}
			const dealers = Array.from(dealerMap, ([id, name]) => ({
				id,
				name,
			}));
			const { customers: _customers, ...rest } = station;
			return { ...rest, dealers };
		});

		return { stations: result };
	});
