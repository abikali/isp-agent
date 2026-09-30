import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { boxShortName } from "@repo/utils";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { boundingBox, groupNearbyBoxes } from "../lib/nearby-boxes";

const BOX_FILTER = {
	OR: [
		{
			mikrotikInterface: {
				contains: "pon",
				mode: "insensitive" as const,
			},
		},
		{
			mikrotikInterface: {
				contains: "olt",
				mode: "insensitive" as const,
			},
		},
	],
};

/** Names listed per box; the total still counts everyone on it. */
const MAX_LISTED = 12;

/**
 * Fiber boxes (ONU VLANs) that already serve customers near a pin — so the
 * admin / worker placing a new customer can avoid stacking a third or fourth
 * subscriber on one box ("if it dies they all go down"). Warn-only.
 *
 * Geo is the pre-install proxy: the interface is only assigned by iRadius
 * after the install, but neighbours on the same box sit within metres of
 * each other. The totals cover the box's full membership, not just the
 * customers inside the radius.
 */
export const nearbyBoxes = protectedProcedure
	.route({
		method: "GET",
		path: "/customers/nearby-boxes",
		tags: ["Customers"],
		summary: "Fiber boxes with customers near a location",
	})
	.input(
		z.object({
			organizationId: z.string(),
			latitude: z.number().min(-90).max(90),
			longitude: z.number().min(-180).max(180),
			radiusM: z.number().int().min(10).max(500).default(60),
			excludeCustomerId: z.string().optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"customers",
			"read",
		);
		const scope = {
			organizationId: input.organizationId,
			deletedAt: null,
			...getDealerScopeFilter(activeDealerId),
			...(input.excludeCustomerId
				? { id: { not: input.excludeCustomerId } }
				: {}),
		};

		const box = boundingBox(input.latitude, input.longitude, input.radiusM);
		const candidates = await db.customer.findMany({
			where: {
				...scope,
				...BOX_FILTER,
				latitude: { gte: box.latMin, lte: box.latMax },
				longitude: { gte: box.lngMin, lte: box.lngMax },
			},
			select: CUSTOMER_SELECT,
		});
		const groups = groupNearbyBoxes(input, candidates, input.radiusM);
		if (groups.length === 0) {
			return { boxes: [] };
		}

		const members = await db.customer.findMany({
			where: {
				...scope,
				mikrotikInterface: { in: groups.map((g) => g.iface) },
			},
			select: CUSTOMER_SELECT,
		});

		return {
			boxes: groups.map((group) => {
				const onBox = members.filter(
					(m) => m.mikrotikInterface === group.iface,
				);
				const distanceById = new Map(
					group.nearby.map((n) => [n.id, n.distanceM]),
				);
				const ordered = [
					...group.nearby,
					...onBox.filter((m) => !distanceById.has(m.id)),
				];
				return {
					interface: group.iface,
					shortName: boxShortName(group.iface),
					total: onBox.length,
					customers: ordered.slice(0, MAX_LISTED).map((c) => ({
						id: c.id,
						username: c.username,
						name:
							[c.firstName, c.lastName]
								.filter(Boolean)
								.join(" ") || c.username,
						status: c.status,
						distanceM: distanceById.get(c.id) ?? null,
					})),
				};
			}),
		};
	});

const CUSTOMER_SELECT = {
	id: true,
	username: true,
	firstName: true,
	lastName: true,
	status: true,
	latitude: true,
	longitude: true,
	mikrotikInterface: true,
} as const;
