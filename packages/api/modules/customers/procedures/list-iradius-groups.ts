import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { queryIRadius, withIRadiusConnection } from "@repo/database/iradius";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const listIRadiusGroups = protectedProcedure
	.route({
		method: "GET",
		path: "/customers/iradius-groups",
		tags: ["Customers"],
		summary: "List UserGroup rows from iRadius for the group picker",
	})
	.input(
		z.object({
			organizationId: z.string(),
			// Local IspDealer.id — when provided, only return UserGroup rows
			// whose iRadius DealerId matches that dealer's externalId.
			dealerId: z.string().optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"customers",
			"read",
		);

		// Explicit input.dealerId (e.g. customer edit form) takes precedence;
		// otherwise default to the caller's active dealer so dealer-scoped
		// users only ever see their own groups. Super-admins (no active
		// dealer) see every group.
		const scopedDealerId = input.dealerId ?? activeDealerId;
		let dealerExternalId: number | null = null;
		if (scopedDealerId) {
			const dealer = await db.ispDealer.findFirst({
				where: {
					id: scopedDealerId,
					organizationId: input.organizationId,
				},
				select: { externalId: true },
			});
			const parsed = dealer?.externalId
				? Number.parseInt(dealer.externalId, 10)
				: Number.NaN;
			if (!Number.isFinite(parsed)) {
				return { groups: [] };
			}
			dealerExternalId = parsed;
		}

		const rows = await withIRadiusConnection((conn) =>
			dealerExternalId !== null
				? queryIRadius(
						conn,
						"SELECT Id, Name FROM UserGroup WHERE DealerId = ? ORDER BY Name",
						[dealerExternalId],
					)
				: queryIRadius(
						conn,
						"SELECT Id, Name FROM UserGroup ORDER BY Name",
					),
		);

		const groups = rows
			.map((r) => {
				const id = Number(r["Id"]);
				const name =
					typeof r["Name"] === "string" ? r["Name"].trim() : "";
				if (!Number.isFinite(id) || !name) {
					return null;
				}
				return { id, name };
			})
			.filter((g): g is { id: number; name: string } => g !== null);

		return { groups };
	});
