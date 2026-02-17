import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import {
	customerAudit,
	getAuditContextFromHeaders,
} from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const bulkExportCustomers = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/bulk-export",
		tags: ["Customers"],
		summary: "Export customers as CSV data",
	})
	.input(
		z.object({
			organizationId: z.string(),
			filters: z
				.object({
					status: z
						.enum(["ACTIVE", "INACTIVE", "SUSPENDED", "PENDING"])
						.optional(),
					planId: z.string().optional(),
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
		if (input.filters?.planId) {
			where["planId"] = input.filters.planId;
		}
		if (input.filters?.stationId) {
			where["stationId"] = input.filters.stationId;
		}

		const customers = await db.customer.findMany({
			where,
			include: {
				plan: { select: { name: true } },
				station: { select: { name: true } },
			},
			orderBy: { accountNumber: "asc" },
		});

		// Build CSV
		const csvHeaders = [
			"Account Number",
			"Full Name",
			"Email",
			"Phone",
			"Address",
			"Username",
			"Plan",
			"Station",
			"Status",
			"Connection Type",
			"IP Address",
			"MAC Address",
			"Monthly Rate",
			"Billing Day",
			"Balance",
			"Notes",
		];

		const csvRows = customers.map((c) => [
			c.accountNumber,
			c.fullName,
			c.email ?? "",
			c.phone ?? "",
			c.address ?? "",
			c.username ?? "",
			c.plan?.name ?? "",
			c.station?.name ?? "",
			c.status,
			c.connectionType ?? "",
			c.ipAddress ?? "",
			c.macAddress ?? "",
			c.monthlyRate?.toString() ?? "",
			c.billingDay?.toString() ?? "",
			c.balance.toString(),
			c.notes ?? "",
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
		customerAudit.exported(user.id, input.organizationId, auditContext, {
			count: customers.length,
		});

		return {
			csv: csvContent,
			count: customers.length,
		};
	});
