import { requirePermission } from "@repo/api/lib/permission";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { FIBER_RISK_REASONS } from "../lib/constants";
import { isAtRisk, scoreActiveCustomers } from "../lib/queries";

/**
 * The defend list: active customers most likely to leave for Ogero fiber,
 * with the reasons. Scored in memory — one org is a few thousand rows.
 */
export const listAtRiskCustomers = protectedProcedure
	.route({
		method: "GET",
		path: "/fiber/at-risk",
		tags: ["Fiber"],
		summary: "Customers at risk of leaving for fiber, highest risk first",
	})
	.input(
		z.object({
			organizationId: z.string(),
			area: z.string().optional(),
			reason: z.enum(FIBER_RISK_REASONS).optional(),
			/** Hide customers who already have a fiber lead. */
			notInPipeline: z.boolean().default(false),
			search: z.string().trim().optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(10).max(200).default(50),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"marketing",
			"read",
		);
		const needle = input.search?.toLowerCase();
		const rows = (
			await scoreActiveCustomers(input.organizationId, activeDealerId)
		).filter(
			(c) =>
				isAtRisk(c) &&
				(!input.area || c.area === input.area) &&
				(!input.reason || c.reasons.includes(input.reason)) &&
				(!input.notInPipeline || !c.lead) &&
				(!needle ||
					c.name.toLowerCase().includes(needle) ||
					(c.username ?? "").toLowerCase().includes(needle)),
		);
		const start = (input.page - 1) * input.pageSize;
		return {
			customers: rows.slice(start, start + input.pageSize),
			total: rows.length,
			/** Every id matching the filters — for "add all to pipeline". */
			allIds: rows.filter((c) => !c.lead).map((c) => c.id),
		};
	});
