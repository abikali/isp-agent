import { ORPCError } from "@orpc/server";
import { db } from "@repo/database";
import { queueIRadiusSync } from "@repo/jobs";
import z from "zod";
import { adminProcedure } from "../../../orpc/procedures";

/**
 * Admin-only: Trigger a global dealer sync from iRadius.
 * Dealers are synced without an organization — admins assign them to orgs later.
 */
export const syncDealers = adminProcedure
	.route({
		method: "POST",
		path: "/admin/dealers/sync",
		tags: ["Administration", "Dealers"],
		summary: "Queue a global dealer sync from iRadius (admin only)",
	})
	.input(z.object({}))
	.handler(async () => {
		// Check no active dealer sync is running
		const active = await db.iRadiusSyncOperation.findFirst({
			where: {
				organizationId: null,
				status: { in: ["pending", "in_progress"] },
			},
		});
		if (active) {
			throw new ORPCError("CONFLICT", {
				message:
					"A dealer sync is already in progress. Please wait for it to complete.",
			});
		}

		// Create operation record (no organizationId — global sync)
		const operation = await db.iRadiusSyncOperation.create({
			data: {
				status: "pending",
			},
		});

		// Queue BullMQ job with dealers-only mode
		await queueIRadiusSync({
			operationId: operation.id,
			mode: "dealers-only",
		});

		return { operationId: operation.id };
	});

/**
 * Admin-only: Get the status of the latest dealer sync operation.
 */
export const getSyncDealersStatus = adminProcedure
	.route({
		method: "GET",
		path: "/admin/dealers/sync-status",
		tags: ["Administration", "Dealers"],
		summary: "Get the status of the latest dealer sync operation",
	})
	.input(
		z.object({
			operationId: z.string().optional(),
		}),
	)
	.handler(async ({ input }) => {
		const operation = input.operationId
			? await db.iRadiusSyncOperation.findUnique({
					where: { id: input.operationId },
				})
			: await db.iRadiusSyncOperation.findFirst({
					where: { organizationId: null },
					orderBy: { createdAt: "desc" },
				});

		return { operation };
	});
