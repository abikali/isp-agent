import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import {
	queryBilling,
	testBillingConnection,
	withBillingConnection,
} from "@repo/database/billing";
import { queueBillingSync } from "@repo/jobs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

// ---------------------------------------------------------------------------
// Test connection
// ---------------------------------------------------------------------------

export const testBilling = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/sync/test",
		tags: ["Billing"],
		summary: "Test billing system connectivity and return table counts",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);

		return testBillingConnection();
	});

// ---------------------------------------------------------------------------
// Preview sync (shows unmatched employees before committing)
// ---------------------------------------------------------------------------

export const previewBillingSync = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/sync/preview",
		tags: ["Billing"],
		summary:
			"Preview what the billing sync will do — returns unmatched employees",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);

		return withBillingConnection(async (conn) => {
			const loginRows = await queryBilling(
				conn,
				"SELECT username, role, phone FROM isplogin WHERE role IN ('collector', 'worker') ORDER BY role, username",
			);

			const existingEmployees = await db.employee.findMany({
				where: { organizationId: input.organizationId },
				select: {
					id: true,
					name: true,
					username: true,
					department: true,
				},
			});
			const existingUsernames = new Set(
				existingEmployees
					.filter((e) => e.username)
					.map((e) => e.username?.toLowerCase()),
			);

			const unmatchedEmployees: Array<{
				username: string;
				role: string;
				phone: string | null;
			}> = [];

			for (const row of loginRows) {
				const username = row["username"] as string | null;
				if (
					!username ||
					existingUsernames.has(username.toLowerCase())
				) {
					continue;
				}
				unmatchedEmployees.push({
					username,
					role: row["role"] as string,
					phone: (row["phone"] as string) ?? null,
				});
			}

			// Load saved mappings from previous syncs
			const savedMappings = await db.billingEmployeeMapping.findMany({
				where: { organizationId: input.organizationId },
			});
			const savedMap = new Map(
				savedMappings.map((m) => [m.billingUsername.toLowerCase(), m]),
			);

			return {
				unmatchedEmployees,
				existingEmployees: existingEmployees.map((e) => ({
					id: e.id,
					name: e.name,
					username: e.username,
					department: e.department,
				})),
				savedMappings: unmatchedEmployees.map((emp) => {
					const saved = savedMap.get(emp.username.toLowerCase());
					return {
						billingUsername: emp.username,
						action: saved?.action ?? "create",
						employeeId: saved?.employeeId ?? null,
					};
				}),
			};
		});
	});

// ---------------------------------------------------------------------------
// Trigger sync (with optional confirmed employees to create)
// ---------------------------------------------------------------------------

export const syncFromBilling = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/sync/start",
		tags: ["Billing"],
		summary: "Queue a full data sync from billing system",
	})
	.input(
		z.object({
			organizationId: z.string(),
			createEmployees: z
				.array(
					z.object({
						username: z.string(),
						role: z.string(),
						phone: z.string().nullable(),
					}),
				)
				.default([]),
			mapEmployees: z
				.array(
					z.object({
						billingUsername: z.string(),
						employeeId: z.string(),
					}),
				)
				.default([]),
			skippedEmployees: z.array(z.string()).default([]),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);

		const active = await db.billingSyncOperation.findFirst({
			where: {
				organizationId: input.organizationId,
				status: { in: ["pending", "in_progress"] },
			},
		});
		if (active) {
			throw new ORPCError("CONFLICT", {
				message:
					"A billing sync is already in progress. Please wait for it to complete.",
			});
		}

		// Persist mappings for next sync
		const mappingUpserts = [
			...input.createEmployees.map((e) => ({
				billingUsername: e.username,
				action: "create" as const,
				employeeId: null,
			})),
			...input.mapEmployees.map((e) => ({
				billingUsername: e.billingUsername,
				action: "map" as const,
				employeeId: e.employeeId,
			})),
			...input.skippedEmployees.map((username) => ({
				billingUsername: username,
				action: "skip" as const,
				employeeId: null,
			})),
		];

		for (const m of mappingUpserts) {
			await db.billingEmployeeMapping.upsert({
				where: {
					organizationId_billingUsername: {
						organizationId: input.organizationId,
						billingUsername: m.billingUsername,
					},
				},
				update: {
					action: m.action,
					employeeId: m.employeeId,
				},
				create: {
					organizationId: input.organizationId,
					billingUsername: m.billingUsername,
					action: m.action,
					employeeId: m.employeeId,
				},
			});
		}

		const operation = await db.billingSyncOperation.create({
			data: {
				organizationId: input.organizationId,
				status: "pending",
			},
		});

		await queueBillingSync({
			operationId: operation.id,
			organizationId: input.organizationId,
			createEmployees: input.createEmployees,
			mapEmployees: input.mapEmployees,
		});

		return { operationId: operation.id };
	});

// ---------------------------------------------------------------------------
// Poll sync status
// ---------------------------------------------------------------------------

export const getBillingSyncStatus = protectedProcedure
	.route({
		method: "GET",
		path: "/billing/sync/status",
		tags: ["Billing"],
		summary: "Get the status of a billing sync operation",
	})
	.input(
		z.object({
			organizationId: z.string(),
			operationId: z.string().optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);

		const operation = input.operationId
			? await db.billingSyncOperation.findUnique({
					where: { id: input.operationId },
				})
			: await db.billingSyncOperation.findFirst({
					where: { organizationId: input.organizationId },
					orderBy: { createdAt: "desc" },
				});

		return { operation };
	});
