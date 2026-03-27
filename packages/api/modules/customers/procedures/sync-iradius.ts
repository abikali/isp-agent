import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { testIRadiusConnection } from "@repo/database/iradius";
import { queueIRadiusSync } from "@repo/jobs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

// ---------------------------------------------------------------------------
// Test connection endpoint (blocking, lightweight)
// ---------------------------------------------------------------------------

export const testIRadius = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/iradius/test",
		tags: ["Customers"],
		summary: "Test iRadius database connectivity and return table counts",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"connections",
			"sync",
		);

		return testIRadiusConnection();
	});

// ---------------------------------------------------------------------------
// Trigger sync (queues BullMQ job)
// ---------------------------------------------------------------------------

export const syncFromIRadius = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/iradius/sync",
		tags: ["Customers"],
		summary: "Queue a full data sync from iRadius database",
	})
	.input(
		z.object({
			organizationId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"connections",
			"sync",
		);

		// Check no active sync for this org
		const active = await db.iRadiusSyncOperation.findFirst({
			where: {
				organizationId: input.organizationId,
				status: { in: ["pending", "in_progress"] },
			},
		});
		if (active) {
			throw new ORPCError("CONFLICT", {
				message:
					"A sync is already in progress for this organization. Please wait for it to complete.",
			});
		}

		// Create operation record
		const operation = await db.iRadiusSyncOperation.create({
			data: {
				organizationId: input.organizationId,
				status: "pending",
			},
		});

		// Queue BullMQ job
		await queueIRadiusSync({
			operationId: operation.id,
			organizationId: input.organizationId,
		});

		return { operationId: operation.id };
	});

// ---------------------------------------------------------------------------
// Poll sync status
// ---------------------------------------------------------------------------

export const getIRadiusSyncStatus = protectedProcedure
	.route({
		method: "GET",
		path: "/customers/iradius/sync-status",
		tags: ["Customers"],
		summary: "Get the status of an iRadius sync operation",
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
			"connections",
			"sync",
		);

		const operation = input.operationId
			? await db.iRadiusSyncOperation.findUnique({
					where: { id: input.operationId },
				})
			: await db.iRadiusSyncOperation.findFirst({
					where: { organizationId: input.organizationId },
					orderBy: { createdAt: "desc" },
				});

		return { operation };
	});
