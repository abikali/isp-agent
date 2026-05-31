import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { cachedStat, statCacheKey } from "@repo/api/lib/stat-cache";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const listServicePlans = protectedProcedure
	.route({
		method: "GET",
		path: "/service-plans",
		tags: ["Service Plans"],
		summary: "List service plans for an organization",
	})
	.input(
		z.object({
			organizationId: z.string(),
			includeArchived: z.boolean().default(false),
			search: z.string().optional(),
		}),
	)
	.handler(
		async ({
			context: { user },
			input: { organizationId, includeArchived, search },
		}) => {
			const { activeDealerId } = await requirePermission(
				organizationId,
				user.id,
				"servicePlans",
				"read",
			);

			return cachedStat(
				statCacheKey("service-plans/list", [
					organizationId,
					activeDealerId,
					includeArchived,
					search ?? null,
				]),
				async () => {
					const where: Record<string, unknown> = {
						organizationId,
						// Hide plans soft-deleted by the iRadius sync cleanup.
						// `archived` is a separate, manually-toggled flag.
						deletedAt: null,
					};
					if (!includeArchived) {
						where["archived"] = false;
					}
					Object.assign(where, getDealerScopeFilter(activeDealerId));
					if (search) {
						where["OR"] = [
							{ name: { contains: search, mode: "insensitive" } },
							{
								description: {
									contains: search,
									mode: "insensitive",
								},
							},
						];
					}

					const plans = await db.servicePlan.findMany({
						where,
						select: {
							id: true,
							externalId: true,
							name: true,
							description: true,
							downloadSpeed: true,
							uploadSpeed: true,
							monthlyPrice: true,
							archived: true,
							visible: true,
							commission: true,
							parentCommission: true,
							createdAt: true,
							dealer: {
								select: { id: true, name: true },
							},
							_count: {
								select: { customers: true },
							},
						},
						orderBy: { createdAt: "desc" },
					});

					return { plans };
				},
			);
		},
	);
