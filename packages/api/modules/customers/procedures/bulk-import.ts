import { ORPCError } from "@orpc/server";
import { checkOrganizationAdmin } from "@repo/api/lib/membership";
import {
	customerAudit,
	getAuditContextFromHeaders,
} from "@repo/auth/lib/audit";
import { type ConnectionType, db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { generateAccountNumber } from "../lib/account-number";

const importRowSchema = z.object({
	fullName: z.string().min(1),
	email: z.string().email().optional(),
	phone: z.string().optional(),
	address: z.string().optional(),
	username: z.string().optional(),
	planName: z.string().optional(),
	stationName: z.string().optional(),
	connectionType: z.string().optional(),
	ipAddress: z.string().optional(),
	macAddress: z.string().optional(),
	monthlyRate: z.number().optional(),
	billingDay: z.number().int().min(1).max(28).optional(),
	notes: z.string().optional(),
});

export const bulkImportCustomers = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/bulk-import",
		tags: ["Customers"],
		summary: "Bulk import customers from parsed CSV data",
	})
	.input(
		z.object({
			organizationId: z.string(),
			rows: z.array(importRowSchema).min(1).max(1000),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const member = await checkOrganizationAdmin(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only organization admins can import customers",
			});
		}

		// Resolve plan names to IDs
		const plans = await db.servicePlan.findMany({
			where: {
				organizationId: input.organizationId,
				archived: false,
			},
			select: { id: true, name: true },
		});
		const planMap = new Map(plans.map((p) => [p.name.toLowerCase(), p.id]));

		// Resolve station names to IDs
		const stations = await db.station.findMany({
			where: { organizationId: input.organizationId },
			select: { id: true, name: true },
		});
		const stationMap = new Map(
			stations.map((s) => [s.name.toLowerCase(), s.id]),
		);

		const validConnectionTypes = new Set([
			"FIBER",
			"WIRELESS",
			"DSL",
			"CABLE",
			"ETHERNET",
		]);

		let successCount = 0;
		let errorCount = 0;
		const errors: Array<{ row: number; error: string }> = [];

		for (let i = 0; i < input.rows.length; i++) {
			const row = input.rows[i];
			if (!row) {
				continue;
			}

			try {
				const accountNumber = await generateAccountNumber(
					input.organizationId,
				);

				const planId = row.planName
					? (planMap.get(row.planName.toLowerCase()) ?? null)
					: null;
				const stationId = row.stationName
					? (stationMap.get(row.stationName.toLowerCase()) ?? null)
					: null;

				let connectionType: ConnectionType | null = null;
				if (row.connectionType) {
					const ct = row.connectionType.toUpperCase();
					if (validConnectionTypes.has(ct)) {
						connectionType = ct as ConnectionType;
					}
				}

				await db.customer.create({
					data: {
						organizationId: input.organizationId,
						accountNumber,
						fullName: row.fullName,
						email: row.email ?? null,
						phone: row.phone ?? null,
						address: row.address ?? null,
						username: row.username ?? null,
						planId,
						stationId,
						connectionType,
						ipAddress: row.ipAddress ?? null,
						macAddress: row.macAddress ?? null,
						monthlyRate: row.monthlyRate ?? null,
						billingDay: row.billingDay ?? null,
						notes: row.notes ?? null,
						status: "ACTIVE",
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
		customerAudit.imported(user.id, input.organizationId, auditContext, {
			count: successCount,
		});

		return {
			successCount,
			errorCount,
			errors: errors.slice(0, 50),
			total: input.rows.length,
		};
	});
