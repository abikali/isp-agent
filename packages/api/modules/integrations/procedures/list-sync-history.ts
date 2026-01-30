import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import {
	getPermissionContext,
	verifyPermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

/**
 * List sync operation history for a connection.
 */
export const listSyncHistory = protectedProcedure
	.route({
		method: "GET",
		path: "/integrations/connections/:id/history",
		tags: ["Integrations"],
		summary: "List sync history",
		description: "List sync operation history for a connection",
	})
	.input(
		z.object({
			connectionId: z.string(),
			limit: z.number().min(1).max(100).default(20),
			cursor: z.string().optional(),
		}),
	)
	.handler(
		async ({
			context: { user },
			input: { connectionId, limit, cursor },
		}) => {
			// Get the connection
			const connection = await db.integrationConnection.findUnique({
				where: { id: connectionId },
				select: {
					id: true,
					organizationId: true,
				},
			});

			if (!connection) {
				throw new ORPCError("NOT_FOUND", {
					message: "Connection not found",
				});
			}

			// Verify membership
			const membership = await verifyOrganizationMembership(
				connection.organizationId,
				user.id,
			);
			if (!membership) {
				throw new ORPCError("FORBIDDEN", {
					message: "You must be a member of this organization",
				});
			}

			// Check permission to read connections
			const permContext = getPermissionContext(
				user.id,
				connection.organizationId,
				membership.role,
			);
			verifyPermission(permContext, "connections", "read");

			// Get sync operations
			const operations = await db.contactSyncOperation.findMany({
				where: {
					connectionId,
					...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
				},
				select: {
					id: true,
					type: true,
					status: true,
					trigger: true,
					totalContacts: true,
					successCount: true,
					errorCount: true,
					errors: true,
					startedAt: true,
					completedAt: true,
					createdAt: true,
				},
				orderBy: { createdAt: "desc" },
				take: limit + 1, // Get one extra to check if there are more
			});

			const hasMore = operations.length > limit;
			const items = hasMore ? operations.slice(0, limit) : operations;
			const nextCursor = hasMore
				? items[items.length - 1]?.createdAt.toISOString()
				: null;

			return {
				operations: items,
				nextCursor,
			};
		},
	);
