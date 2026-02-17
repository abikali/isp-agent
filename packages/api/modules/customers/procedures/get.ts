import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const getCustomer = protectedProcedure
	.route({
		method: "GET",
		path: "/customers/{id}",
		tags: ["Customers"],
		summary: "Get a single customer with plan and station details",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const member = await verifyOrganizationMembership(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "You must be a member of this organization",
			});
		}

		const customer = await db.customer.findFirst({
			where: {
				id: input.id,
				organizationId: input.organizationId,
			},
			include: {
				plan: {
					select: {
						id: true,
						name: true,
						downloadSpeed: true,
						uploadSpeed: true,
						monthlyPrice: true,
					},
				},
				station: {
					select: {
						id: true,
						name: true,
						address: true,
						status: true,
					},
				},
			},
		});

		if (!customer) {
			throw new ORPCError("NOT_FOUND", {
				message: "Customer not found",
			});
		}

		const { pinHash, ...customerData } = customer;

		return { customer: { ...customerData, hasPin: pinHash !== null } };
	});
