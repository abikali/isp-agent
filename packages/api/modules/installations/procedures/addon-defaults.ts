import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

async function modePrice(
	organizationId: string,
	field: "iptvPrice" | "realIpPrice",
): Promise<number> {
	const groups = await db.customer.groupBy({
		by: [field],
		where: { organizationId, [field]: { gt: 0 }, deletedAt: null },
		_count: true,
		orderBy: { _count: { [field]: "desc" } },
		take: 1,
	});
	return groups[0]?.[field] ?? 0;
}

/**
 * Default prices for IPTV / Real IP add-ons, derived from the most common
 * non-zero value across existing customers (the legacy system auto-filled
 * these from its add-on plans table, which has no equivalent here).
 */
export const getAddonDefaults = protectedProcedure
	.route({
		method: "GET",
		path: "/installations/addon-defaults",
		tags: ["Installations"],
		summary: "Default IPTV / Real IP add-on prices",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"installations",
			"create",
		);

		const [iptvPrice, realIpPrice] = await Promise.all([
			modePrice(input.organizationId, "iptvPrice"),
			modePrice(input.organizationId, "realIpPrice"),
		]);

		return { iptvPrice, realIpPrice };
	});
