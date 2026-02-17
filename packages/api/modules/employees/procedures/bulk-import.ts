import { ORPCError } from "@orpc/server";
import { checkOrganizationAdmin } from "@repo/api/lib/membership";
import {
	employeeAudit,
	getAuditContextFromHeaders,
} from "@repo/auth/lib/audit";
import type { EmployeeDepartment } from "@repo/database";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { generateEmployeeNumber } from "../lib/employee-number";

const validDepartments = new Set([
	"TECHNICAL",
	"CUSTOMER_SERVICE",
	"BILLING",
	"MANAGEMENT",
	"FIELD_OPS",
]);

export const bulkImportEmployees = protectedProcedure
	.route({
		method: "POST",
		path: "/employees/bulk-import",
		tags: ["Employees"],
		summary: "Bulk import employees from CSV data",
	})
	.input(
		z.object({
			organizationId: z.string(),
			rows: z.array(
				z.object({
					name: z.string().min(1),
					email: z.string().optional(),
					phone: z.string().optional(),
					position: z.string().optional(),
					department: z.string().optional(),
					hireDate: z.string().optional(),
					notes: z.string().optional(),
					stationName: z.string().optional(),
				}),
			),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const member = await checkOrganizationAdmin(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only organization admins can import employees",
			});
		}

		// Resolve station names to IDs
		const stations = await db.station.findMany({
			where: { organizationId: input.organizationId },
			select: { id: true, name: true },
		});
		const stationMap = new Map(
			stations.map((s) => [s.name.toLowerCase(), s.id]),
		);

		let successCount = 0;
		let errorCount = 0;
		const errors: Array<{ row: number; error: string }> = [];

		for (let i = 0; i < input.rows.length; i++) {
			const row = input.rows[i];
			if (!row) {
				continue;
			}
			try {
				const employeeNumber = await generateEmployeeNumber(
					input.organizationId,
				);

				let department: EmployeeDepartment | null = null;
				if (row.department) {
					const dept = row.department
						.toUpperCase()
						.replace(/\s+/g, "_");
					if (validDepartments.has(dept)) {
						department = dept as EmployeeDepartment;
					}
				}

				const stationId = row.stationName
					? (stationMap.get(row.stationName.toLowerCase()) ?? null)
					: null;

				let hireDate: Date | null = null;
				if (row.hireDate) {
					const parsed = new Date(row.hireDate);
					if (!Number.isNaN(parsed.getTime())) {
						hireDate = parsed;
					}
				}

				await db.employee.create({
					data: {
						organizationId: input.organizationId,
						employeeNumber,
						name: row.name,
						email: row.email ?? null,
						phone: row.phone ?? null,
						position: row.position ?? null,
						department,
						hireDate,
						notes: row.notes ?? null,
						status: "ACTIVE",
						...(stationId
							? { stations: { create: [{ stationId }] } }
							: {}),
					},
				});

				successCount++;
			} catch (error) {
				errorCount++;
				errors.push({
					row: i + 1,
					error:
						error instanceof Error
							? error.message
							: "Unknown error",
				});
			}
		}

		const auditContext = getAuditContextFromHeaders(headers);
		employeeAudit.imported(user.id, input.organizationId, auditContext, {
			count: successCount,
		});

		return {
			successCount,
			errorCount,
			errors: errors.slice(0, 50),
			total: input.rows.length,
		};
	});
