import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

interface LiveStatsRow {
	online: bigint;
	offline: bigint;
	active: bigint;
	inactive: bigint;
	expired: bigint;
	fup: bigint;
	archived: bigint;
}

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
		const { activeDealerId } = await requirePermission(
			organizationId,
			user.id,
			"customers",
			"read",
		);

		// One round-trip with conditional COUNTs. Computed locally rather than
		// against iRadius because iRadius's dashboard query is org-wide and
		// would leak across the active-dealer boundary.
		const [row] = await db.$queryRaw<LiveStatsRow[]>`
			SELECT
				COUNT(*) FILTER (WHERE status = 'ACTIVE' AND online = TRUE) AS online,
				COUNT(*) FILTER (WHERE status = 'ACTIVE' AND online = FALSE) AS offline,
				COUNT(*) FILTER (WHERE status = 'ACTIVE') AS active,
				COUNT(*) FILTER (WHERE status IN ('INACTIVE', 'SUSPENDED', 'PENDING')) AS inactive,
				COUNT(*) FILTER (WHERE status = 'ACTIVE' AND "expiresAt" < NOW()) AS expired,
				COUNT(*) FILTER (WHERE status = 'ACTIVE' AND "fupMode" IS NOT NULL) AS fup,
				COUNT(*) FILTER (WHERE status = 'INACTIVE') AS archived
			FROM customer
			WHERE "organizationId" = ${organizationId}
			  AND "dealerId" IS NOT DISTINCT FROM ${activeDealerId}
		`;

		const active = Number(row?.active ?? 0);

		return {
			available: true as const,
			online: Number(row?.online ?? 0),
			offline: Number(row?.offline ?? 0),
			active,
			inactive: Number(row?.inactive ?? 0),
			expired: Number(row?.expired ?? 0),
			fup: Number(row?.fup ?? 0),
			archived: Number(row?.archived ?? 0),
			totalSubscribers: active,
		};
	});
