import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const listExecutions = protectedProcedure
	.route({
		method: "GET",
		path: "/watchers/{watcherId}/executions",
		tags: ["Watchers"],
		summary: "List execution history for a watcher",
	})
	.input(
		z.object({
			organizationId: z.string(),
			watcherId: z.string(),
			cursor: z.string().optional(),
			limit: z.number().int().min(1).max(100).default(50),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const member = await verifyOrganizationMembership(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "You must be a member of this organization",
			});
		}

		// Verify watcher belongs to organization
		const watcher = await db.watcher.findFirst({
			where: {
				id: input.watcherId,
				organizationId: input.organizationId,
			},
			select: { id: true },
		});
		if (!watcher) {
			throw new ORPCError("NOT_FOUND", {
				message: "Watcher not found",
			});
		}

		const executions = await db.watcherExecution.findMany({
			where: {
				watcherId: input.watcherId,
				...(input.cursor
					? { createdAt: { lt: new Date(input.cursor) } }
					: {}),
			},
			orderBy: { createdAt: "desc" },
			take: input.limit + 1,
		});

		const hasMore = executions.length > input.limit;
		if (hasMore) {
			executions.pop();
		}

		const nextCursor =
			hasMore && executions.length > 0
				? executions[executions.length - 1]?.createdAt.toISOString()
				: undefined;

		return { executions, nextCursor };
	});
