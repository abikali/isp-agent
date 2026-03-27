import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

/**
 * Get the current user's Employee and/or Dealer record for the active organization.
 * Returns null for each if the user isn't linked to one.
 */
export const getMyEmployeeIdentity = protectedProcedure
	.route({
		method: "GET",
		path: "/employees/me",
		tags: ["Employees"],
		summary: "Get the current user's employee/dealer identity",
	})
	.input(z.object({ organizationId: z.string() }))
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

		const [employee, dealer] = await Promise.all([
			db.employee.findFirst({
				where: {
					organizationId: input.organizationId,
					userId: user.id,
				},
				select: {
					id: true,
					name: true,
					employeeNumber: true,
					position: true,
					department: true,
					email: true,
					phone: true,
				},
			}),
			db.ispDealer.findFirst({
				where: {
					organizationId: input.organizationId,
					userId: user.id,
				},
				select: {
					id: true,
					name: true,
					username: true,
					email: true,
					phone: true,
					credit: true,
					commission: true,
				},
			}),
		]);

		return { employee, dealer };
	});
