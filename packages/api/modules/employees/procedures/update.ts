import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import {
	employeeAudit,
	getAuditContextFromHeaders,
} from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const updateEmployee = protectedProcedure
	.route({
		method: "POST",
		path: "/employees/update",
		tags: ["Employees"],
		summary: "Update an employee",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
			name: z.string().min(1).max(200).optional(),
			email: z.string().email().nullable().optional(),
			phone: z.string().max(50).nullable().optional(),
			position: z.string().max(200).nullable().optional(),
			department: z
				.enum([
					"TECHNICAL",
					"CUSTOMER_SERVICE",
					"BILLING",
					"MANAGEMENT",
					"FIELD_OPS",
				])
				.nullable()
				.optional(),
			hireDate: z.coerce.date().nullable().optional(),
			status: z.enum(["ACTIVE", "INACTIVE", "ON_LEAVE"]).optional(),
			notes: z.string().max(5000).nullable().optional(),
			preferredLayout: z.enum(["standard", "collector"]).optional(),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"employees",
			"update",
		);

		const existing = await db.employee.findFirst({
			where: {
				id: input.id,
				organizationId: input.organizationId,
				...getDealerScopeFilter(activeDealerId),
			},
		});
		if (!existing) {
			throw new ORPCError("NOT_FOUND", {
				message: "Employee not found",
			});
		}

		const normalizedEmail =
			input.email === undefined
				? undefined
				: (input.email?.trim().toLowerCase() ?? null);

		// Check email uniqueness within the organization
		if (normalizedEmail !== undefined && normalizedEmail !== null) {
			const emailTaken = await db.employee.findFirst({
				where: {
					organizationId: input.organizationId,
					email: {
						equals: normalizedEmail,
						mode: "insensitive",
					},
					id: { not: input.id },
				},
			});
			if (emailTaken) {
				throw new ORPCError("CONFLICT", {
					message: `Email "${normalizedEmail}" is already used by another employee (${emailTaken.name})`,
				});
			}
		}

		const updateData: Record<string, unknown> = {};
		if (input.name !== undefined) {
			updateData["name"] = input.name;
		}
		if (input.email !== undefined) {
			updateData["email"] = normalizedEmail ?? null;
		}
		if (input.phone !== undefined) {
			updateData["phone"] = input.phone ?? null;
		}
		if (input.position !== undefined) {
			updateData["position"] = input.position ?? null;
		}
		if (input.department !== undefined) {
			updateData["department"] = input.department ?? null;
		}
		if (input.hireDate !== undefined) {
			updateData["hireDate"] = input.hireDate ?? null;
		}
		if (input.status !== undefined) {
			updateData["status"] = input.status;
		}
		if (input.notes !== undefined) {
			updateData["notes"] = input.notes ?? null;
		}
		if (input.preferredLayout !== undefined) {
			updateData["preferredLayout"] = input.preferredLayout;
		}

		const employee = await db.employee.update({
			where: { id: input.id },
			data: updateData,
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
		employeeAudit.updated(
			employee.id,
			user.id,
			input.organizationId,
			auditContext,
		);

		return { employee };
	});
