import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const getCustomerStats = protectedProcedure
	.route({
		method: "GET",
		path: "/customers/stats",
		tags: ["Customers"],
		summary: "Get customer dashboard statistics",
	})
	.input(
		z.object({
			organizationId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input: { organizationId } }) => {
		const member = await verifyOrganizationMembership(
			organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "You must be a member of this organization",
			});
		}

		const [total, active, inactive, suspended, pending] = await Promise.all(
			[
				db.customer.count({ where: { organizationId } }),
				db.customer.count({
					where: { organizationId, status: "ACTIVE" },
				}),
				db.customer.count({
					where: { organizationId, status: "INACTIVE" },
				}),
				db.customer.count({
					where: { organizationId, status: "SUSPENDED" },
				}),
				db.customer.count({
					where: { organizationId, status: "PENDING" },
				}),
			],
		);

		// Calculate total monthly revenue from active customers
		const revenueResult = await db.customer.findMany({
			where: { organizationId, status: "ACTIVE" },
			select: {
				monthlyRate: true,
				plan: {
					select: { monthlyPrice: true },
				},
			},
		});

		let totalMonthlyRevenue = 0;
		for (const c of revenueResult) {
			if (c.monthlyRate !== null) {
				totalMonthlyRevenue += c.monthlyRate;
			} else if (c.plan) {
				totalMonthlyRevenue += c.plan.monthlyPrice;
			}
		}

		return {
			total,
			active,
			inactive,
			suspended,
			pending,
			totalMonthlyRevenue,
		};
	});
