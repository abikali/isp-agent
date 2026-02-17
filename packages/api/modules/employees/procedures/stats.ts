import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const getEmployeeStats = protectedProcedure
	.route({
		method: "GET",
		path: "/employees/stats",
		tags: ["Employees"],
		summary: "Get employee dashboard statistics",
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

		const [total, active, inactive, onLeave] = await Promise.all([
			db.employee.count({ where: { organizationId } }),
			db.employee.count({
				where: { organizationId, status: "ACTIVE" },
			}),
			db.employee.count({
				where: { organizationId, status: "INACTIVE" },
			}),
			db.employee.count({
				where: { organizationId, status: "ON_LEAVE" },
			}),
		]);

		return {
			total,
			active,
			inactive,
			onLeave,
		};
	});
