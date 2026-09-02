import { requirePermission } from "@repo/api/lib/permission";
import { invalidateStat } from "@repo/api/lib/stat-cache";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { FINANCE_STAT_CACHE } from "../lib/cache";

/**
 * Drop this organization's cached finance numbers so the next read recomputes.
 *
 * The summary and trend are served from a short Redis cache; an owner who just
 * watched a collector hand in cash should not have to wait for a TTL to see
 * it. Nothing else changes — the client refetches right after.
 */
export const refreshFinance = protectedProcedure
	.route({
		method: "POST",
		path: "/finance/refresh",
		tags: ["Finance"],
		summary: "Recompute the finance numbers now",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"view",
		);

		await Promise.all([
			invalidateStat(FINANCE_STAT_CACHE.summary, [input.organizationId]),
			invalidateStat(FINANCE_STAT_CACHE.trend, [input.organizationId]),
		]);

		return { refreshedAt: new Date().toISOString() };
	});
