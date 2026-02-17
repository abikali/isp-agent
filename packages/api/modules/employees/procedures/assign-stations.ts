import { ORPCError } from "@orpc/server";
import { checkOrganizationAdmin } from "@repo/api/lib/membership";
import {
	employeeAudit,
	getAuditContextFromHeaders,
} from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const assignStations = protectedProcedure
	.route({
		method: "POST",
		path: "/employees/assign-stations",
		tags: ["Employees"],
		summary: "Replace station assignments for an employee",
	})
	.input(
		z.object({
			organizationId: z.string(),
			employeeId: z.string(),
			stationIds: z.array(z.string()),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const member = await checkOrganizationAdmin(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only organization admins can assign stations",
			});
		}

		const existing = await db.employee.findFirst({
			where: {
				id: input.employeeId,
				organizationId: input.organizationId,
			},
		});
		if (!existing) {
			throw new ORPCError("NOT_FOUND", {
				message: "Employee not found",
			});
		}

		// Replace all station assignments
		await db.$transaction([
			db.employeeStation.deleteMany({
				where: { employeeId: input.employeeId },
			}),
			...input.stationIds.map((stationId) =>
				db.employeeStation.create({
					data: {
						employeeId: input.employeeId,
						stationId,
					},
				}),
			),
		]);

		const auditContext = getAuditContextFromHeaders(headers);
		employeeAudit.stationsAssigned(
			input.employeeId,
			user.id,
			input.organizationId,
			auditContext,
			{ stationIds: input.stationIds },
		);

		return { success: true };
	});
