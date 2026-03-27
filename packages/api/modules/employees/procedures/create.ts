import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
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
		await requirePermission(
			input.organizationId,
			user.id,
			"employees",
			"create",
		);

		const normalizedEmail = input.email?.trim().toLowerCase() || undefined;

		// Check email uniqueness within the organization
		if (normalizedEmail) {
			const emailTaken = await db.employee.findFirst({
				where: {
					organizationId: input.organizationId,
					email: {
						equals: normalizedEmail,
						mode: "insensitive",
					},
				},
			});
			if (emailTaken) {
				throw new ORPCError("CONFLICT", {
					message: `Email "${normalizedEmail}" is already used by another employee (${emailTaken.name})`,
				});
			}
		}

		const employeeNumber = await generateEmployeeNumber(
			input.organizationId,
		);

		const employee = await db.employee.create({
			data: {
				organizationId: input.organizationId,
				employeeNumber,
				name: input.name,
				email: normalizedEmail ?? null,
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
