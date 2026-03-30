import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
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
		const { activeDealerId } = await requirePermission(
			organizationId,
			user.id,
			"employees",
			"read",
		);

		const dealerFilter = getDealerScopeFilter(activeDealerId);

		const [total, active, inactive, onLeave] = await Promise.all([
			db.employee.count({
				where: { organizationId, ...dealerFilter },
			}),
			db.employee.count({
				where: { organizationId, status: "ACTIVE", ...dealerFilter },
			}),
			db.employee.count({
				where: { organizationId, status: "INACTIVE", ...dealerFilter },
			}),
			db.employee.count({
				where: { organizationId, status: "ON_LEAVE", ...dealerFilter },
			}),
		]);

		return {
			total,
			active,
			inactive,
			onLeave,
		};
	});
