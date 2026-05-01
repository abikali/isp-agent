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
		const { iradiusDisabled } = await requirePermission(
			input.organizationId,
			user.id,
			"connections",
			"sync",
		);
		if (iradiusDisabled) {
			throw new ORPCError("BAD_REQUEST", {
				message: "iRadius is disabled for this organization",
			});
		}

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
		const { iradiusDisabled } = await requirePermission(
			input.organizationId,
			user.id,
			"connections",
			"sync",
		);
		if (iradiusDisabled) {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"iRadius is disabled for this organization — sync cannot be triggered",
			});
		}

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

		// Clear all pending conflicts from previous syncs
		await db.syncConflict.deleteMany({
			where: {
				organizationId: input.organizationId,
				status: "pending",
			},
		});

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
// Cancel sync (marks stuck/active operations as failed)
// ---------------------------------------------------------------------------

export const cancelIRadiusSync = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/iradius/sync/cancel",
		tags: ["Customers"],
		summary: "Cancel an active iRadius sync operation",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"connections",
			"sync",
		);

		const result = await db.iRadiusSyncOperation.updateMany({
			where: {
				organizationId: input.organizationId,
				status: { in: ["pending", "in_progress"] },
			},
			data: {
				status: "failed",
				result: {
					errors: [
						{ phase: "cancelled", detail: "Cancelled by admin" },
					],
				},
				completedAt: new Date(),
			},
		});

		return { cancelled: result.count };
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
