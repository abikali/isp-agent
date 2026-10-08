import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { cachedStat, statCacheKey } from "@repo/api/lib/stat-cache";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import {
	loadOrgDealerLines,
	resolvePlanLine,
} from "../../dealers/lib/internal-lines";

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

					const [rows, lines] = await Promise.all([
						db.servicePlan.findMany({
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
								isFiber: true,
								commission: true,
								parentCommission: true,
								createdAt: true,
								dealer: {
									select: { id: true, name: true },
								},
								dealerId: true,
								dealerExternalId: true,
								_count: {
									select: { customers: true },
								},
							},
							orderBy: { createdAt: "desc" },
						}),
						loadOrgDealerLines(organizationId),
					]);

					// Which internal dealer line sells each plan (null = the
					// main line), so pickers can label and filter by line.
					const plans = rows.map(
						({ dealerId, dealerExternalId, ...plan }) => {
							const line = resolvePlanLine(
								{ dealerId, dealerExternalId },
								lines,
							);
							return {
								...plan,
								line:
									line.kind === "line"
										? { id: line.dealerId, name: line.name }
										: null,
							};
						},
					);

					return { plans };
				},
			);
		},
	);
