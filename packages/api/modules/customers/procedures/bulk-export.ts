import {
	getDealerScopeFilter,
	getOwnershipFilterAsync,
	requirePermission,
} from "@repo/api/lib/permission";
import {
	customerAudit,
	getAuditContextFromHeaders,
} from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { CUSTOMER_EXPORT_STATUSES } from "../lib/statuses";

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
					status: z.enum(CUSTOMER_EXPORT_STATUSES).optional(),
					planId: z.string().optional(),
					stationId: z.string().optional(),
				})
				.optional(),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const { permCtx, activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"customers",
			"export",
		);

		const ownerFilter = await getOwnershipFilterAsync(
			permCtx,
			"customers",
			"export",
		);

		const where: Record<string, unknown> = {
			organizationId: input.organizationId,
			// Skip soft-deleted rows (iRadius `User` row gone, or `ParentId`
			// now outside the org's allowed dealer subtree). They live in the
			// table only as back-references for payments/installations and
			// shouldn't show up in exports.
			deletedAt: null,
			...ownerFilter,
			...getDealerScopeFilter(activeDealerId),
		};
		if (input.filters?.status === "EXPIRED") {
			where["status"] = "ACTIVE";
			where["expiresAt"] = { lt: new Date() };
		} else if (input.filters?.status === "ONLINE") {
			where["status"] = "ACTIVE";
			where["online"] = true;
		} else if (input.filters?.status === "OFFLINE") {
			where["status"] = "ACTIVE";
			where["online"] = false;
		} else if (input.filters?.status) {
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
			"First Name",
			"Last Name",
			"Email",
			"Mobile",
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
			"Balance",
			"Notes",
		];

		const csvRows = customers.map((c) => [
			c.accountNumber,
			c.firstName ?? "",
			c.lastName ?? "",
			c.email ?? "",
			c.mobile ?? "",
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
