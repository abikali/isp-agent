import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const getRecentSyncs = protectedProcedure
	.route({
		method: "GET",
		path: "/iradius/recent-syncs",
		tags: ["iRadius"],
		summary: "Last N iRadius sync operations for this organization",
	})
	.input(
		z.object({
			organizationId: z.string(),
			limit: z.number().int().min(1).max(20).default(5),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"connections",
			"read",
		);

		const ops = await db.iRadiusSyncOperation.findMany({
			where: { organizationId: input.organizationId },
			orderBy: { createdAt: "desc" },
			take: input.limit,
			select: {
				id: true,
				status: true,
				phase: true,
				startedAt: true,
				completedAt: true,
				createdAt: true,
				totalCustomers: true,
				processedCustomers: true,
				totalConflicts: true,
				resolvedConflicts: true,
				removedRecords: true,
				restoredRecords: true,
			},
		});

		const conflictCount = await db.syncConflict.count({
			where: {
				organizationId: input.organizationId,
				status: "pending",
			},
		});

		return { operations: ops, pendingConflicts: conflictCount };
	});
