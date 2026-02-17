import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import {
	employeeAudit,
	getAuditContextFromHeaders,
} from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const bulkExportEmployees = protectedProcedure
	.route({
		method: "POST",
		path: "/employees/bulk-export",
		tags: ["Employees"],
		summary: "Export employees as CSV data",
	})
	.input(
		z.object({
			organizationId: z.string(),
			filters: z
				.object({
					status: z
						.enum(["ACTIVE", "INACTIVE", "ON_LEAVE"])
						.optional(),
					department: z
						.enum([
							"TECHNICAL",
							"CUSTOMER_SERVICE",
							"BILLING",
							"MANAGEMENT",
							"FIELD_OPS",
						])
						.optional(),
					stationId: z.string().optional(),
				})
				.optional(),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const member = await verifyOrganizationMembership(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "You must be a member of this organization",
			});
		}

		const where: Record<string, unknown> = {
			organizationId: input.organizationId,
		};
		if (input.filters?.status) {
			where["status"] = input.filters.status;
		}
		if (input.filters?.department) {
			where["department"] = input.filters.department;
		}
		if (input.filters?.stationId) {
			where["stations"] = {
				some: { stationId: input.filters.stationId },
			};
		}

		const employees = await db.employee.findMany({
			where,
			include: {
				stations: {
					select: {
						station: { select: { name: true } },
					},
				},
			},
			orderBy: { employeeNumber: "asc" },
		});

		const csvHeaders = [
			"Employee Number",
			"Name",
			"Email",
			"Phone",
			"Position",
			"Department",
			"Hire Date",
			"Status",
			"Station(s)",
			"Notes",
		];

		const csvRows = employees.map((e) => [
			e.employeeNumber,
			e.name,
			e.email ?? "",
			e.phone ?? "",
			e.position ?? "",
			e.department ?? "",
			e.hireDate ? (e.hireDate.toISOString().split("T")[0] ?? "") : "",
			e.status,
			e.stations.map((s) => s.station.name).join("; "),
			e.notes ?? "",
		]);

		function escapeCsvField(field: string): string {
			if (
				field.includes(",") ||
				field.includes('"') ||
				field.includes("\n")
			) {
				return `"${field.replace(/"/g, '""')}"`;
			}
			return field;
		}

		const csvContent = [
			csvHeaders.map(escapeCsvField).join(","),
			...csvRows.map((row) => row.map(escapeCsvField).join(",")),
		].join("\n");

		const auditContext = getAuditContextFromHeaders(headers);
		employeeAudit.exported(user.id, input.organizationId, auditContext, {
			count: employees.length,
		});

		return {
			csv: csvContent,
			count: employees.length,
		};
	});
