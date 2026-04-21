import { requirePermission } from "@repo/api/lib/permission";
import {
	customerAudit,
	getAuditContextFromHeaders,
} from "@repo/auth/lib/audit";
import { type ConnectionType, db } from "@repo/database";
import { createAccountNumberGenerator } from "@repo/jobs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

const importRowSchema = z.object({
	firstName: z.string().min(1),
	lastName: z.string().optional(),
	email: z.string().email().optional(),
	mobile: z.string().optional(),
	phone: z.string().optional(),
	address: z.string().optional(),
	username: z.string().optional(),
	planName: z.string().optional(),
	stationName: z.string().optional(),
	connectionType: z.string().optional(),
	monthlyRate: z.number().optional(),
	notes: z.string().optional(),
});

const IMPORT_BATCH_SIZE = 200;

const VALID_CONNECTION_TYPES = new Set([
	"FIBER",
	"WIRELESS",
	"DSL",
	"CABLE",
	"ETHERNET",
]);

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
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"customers",
			"import",
		);

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

		const nextAccountNumber = await createAccountNumberGenerator(
			input.organizationId,
		);

		// Pre-validate and build all records
		const errors: Array<{ row: number; error: string }> = [];
		const validRecords: Array<{
			organizationId: string;
			accountNumber: string;
			dealerId: string | null;
			firstName: string;
			lastName: string | null;
			email: string | null;
			mobile: string | null;
			phone: string | null;
			address: string | null;
			username: string | null;
			planId: string | null;
			stationId: string | null;
			connectionType: ConnectionType | null;
			monthlyRate: number | null;
			notes: string | null;
			status: "ACTIVE";
		}> = [];

		for (let i = 0; i < input.rows.length; i++) {
			const row = input.rows[i];
			if (!row) {
				continue;
			}

			try {
				const planId = row.planName
					? (planMap.get(row.planName.toLowerCase()) ?? null)
					: null;
				const stationId = row.stationName
					? (stationMap.get(row.stationName.toLowerCase()) ?? null)
					: null;

				let connectionType: ConnectionType | null = null;
				if (row.connectionType) {
					const ct = row.connectionType.toUpperCase();
					if (VALID_CONNECTION_TYPES.has(ct)) {
						connectionType = ct as ConnectionType;
					}
				}

				validRecords.push({
					organizationId: input.organizationId,
					accountNumber: nextAccountNumber(),
					dealerId: activeDealerId ?? null,
					firstName: row.firstName,
					lastName: row.lastName ?? null,
					email: row.email ?? null,
					mobile: row.mobile ?? null,
					phone: row.phone ?? null,
					address: row.address ?? null,
					username: row.username ?? null,
					planId,
					stationId,
					connectionType,
					monthlyRate: row.monthlyRate ?? null,
					notes: row.notes ?? null,
					status: "ACTIVE",
				});
			} catch (error) {
				errors.push({
					row: i + 1,
					error:
						error instanceof Error
							? error.message
							: "Unknown error",
				});
			}
		}

		// Batch insert valid records
		let successCount = 0;
		for (let i = 0; i < validRecords.length; i += IMPORT_BATCH_SIZE) {
			const batch = validRecords.slice(i, i + IMPORT_BATCH_SIZE);
			try {
				const result = await db.customer.createMany({
					data: batch,
					skipDuplicates: true,
				});
				successCount += result.count;
			} catch {
				// If batch fails, fall back to individual inserts for this batch
				for (let j = 0; j < batch.length; j++) {
					const record = batch[j];
					if (!record) {
						continue;
					}
					try {
						await db.customer.create({ data: record });
						successCount++;
					} catch (err) {
						errors.push({
							row: i + j + 1,
							error:
								err instanceof Error
									? err.message
									: "Unknown error",
						});
					}
				}
			}
		}

		const errorCount = input.rows.length - successCount;

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
