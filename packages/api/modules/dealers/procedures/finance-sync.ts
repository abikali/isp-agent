import { ORPCError } from "@orpc/server";
import { db } from "@repo/database";
import { queueIRadiusSync } from "@repo/jobs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { resolveDealerScope } from "../lib/scope";

/**
 * Pull dealers and their ledgers from iRadius now.
 *
 * The dealer sync is global (dealers are not org-scoped), so this queues the
 * same "dealers-only" job the platform admin page uses. A scheduled run also
 * fires every 30 minutes; this button is for the owner who just took cash and
 * wants the page to agree with iRadius immediately.
 */
export const syncDealerFinanceNow = protectedProcedure
	.route({
		method: "POST",
		path: "/dealers/finance/sync",
		tags: ["Dealers"],
		summary: "Refresh dealers and ledgers from iRadius now",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		const scope = await resolveDealerScope(
			input.organizationId,
			user.id,
			"manage",
		);
		if (scope.iradiusDisabled) {
			throw new ORPCError("BAD_REQUEST", {
				message: "iRadius is disabled for this organization.",
			});
		}

		const active = await db.iRadiusSyncOperation.findFirst({
			where: {
				organizationId: null,
				status: { in: ["pending", "in_progress"] },
			},
			select: { id: true },
		});
		if (active) {
			return { operationId: active.id, alreadyRunning: true };
		}

		const operation = await db.iRadiusSyncOperation.create({
			data: { status: "pending" },
			select: { id: true },
		});
		await queueIRadiusSync({
			operationId: operation.id,
			mode: "dealers-only",
		});

		return { operationId: operation.id, alreadyRunning: false };
	});

export const getDealerFinanceSyncStatus = protectedProcedure
	.route({
		method: "GET",
		path: "/dealers/finance/sync-status",
		tags: ["Dealers"],
		summary: "Status of the latest dealer sync",
	})
	.input(
		z.object({
			organizationId: z.string(),
			operationId: z.string().optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await resolveDealerScope(input.organizationId, user.id, "read");

		const operation = await db.iRadiusSyncOperation.findFirst({
			where: input.operationId
				? { id: input.operationId }
				: { organizationId: null },
			orderBy: { createdAt: "desc" },
			select: {
				id: true,
				status: true,
				phase: true,
				totalDealers: true,
				processedDealers: true,
				totalDealerAccounts: true,
				processedDealerAccounts: true,
				startedAt: true,
				completedAt: true,
				createdAt: true,
			},
		});

		return { operation };
	});
