import { ORPCError } from "@orpc/server";
import { checkOrganizationAdmin } from "@repo/api/lib/membership";
import {
	employeeAudit,
	getAuditContextFromHeaders,
} from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { generateEmployeeNumber } from "../lib/employee-number";

export const createEmployee = protectedProcedure
	.route({
		method: "POST",
		path: "/employees",
		tags: ["Employees"],
		summary: "Create a new employee",
	})
	.input(
		z.object({
			organizationId: z.string(),
			name: z.string().min(1).max(200),
			email: z.string().email().optional(),
			phone: z.string().max(50).optional(),
			position: z.string().max(200).optional(),
			department: z
				.enum([
					"TECHNICAL",
					"CUSTOMER_SERVICE",
					"BILLING",
					"MANAGEMENT",
					"FIELD_OPS",
				])
				.optional(),
			hireDate: z.coerce.date().optional(),
			status: z
				.enum(["ACTIVE", "INACTIVE", "ON_LEAVE"])
				.default("ACTIVE"),
			notes: z.string().max(5000).optional(),
			stationIds: z.array(z.string()).optional(),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const member = await checkOrganizationAdmin(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only organization admins can create employees",
			});
		}

		const employeeNumber = await generateEmployeeNumber(
			input.organizationId,
		);

		const employee = await db.employee.create({
			data: {
				organizationId: input.organizationId,
				employeeNumber,
				name: input.name,
				email: input.email ?? null,
				phone: input.phone ?? null,
				position: input.position ?? null,
				department: input.department ?? null,
				hireDate: input.hireDate ?? null,
				status: input.status,
				notes: input.notes ?? null,
				...(input.stationIds?.length
					? {
							stations: {
								create: input.stationIds.map((stationId) => ({
									stationId,
								})),
							},
						}
					: {}),
			},
			select: {
				id: true,
				employeeNumber: true,
				name: true,
				email: true,
				status: true,
				createdAt: true,
			},
		});

		const auditContext = getAuditContextFromHeaders(headers);
		employeeAudit.created(
			employee.id,
			user.id,
			input.organizationId,
			auditContext,
			{ name: input.name, employeeNumber },
		);

		return { employee };
	});
