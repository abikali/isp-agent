import { requirePermission } from "@repo/api/lib/permission";
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
		await requirePermission(organizationId, user.id, "employees", "read");

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
