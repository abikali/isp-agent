import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import {
	getPermissionContext,
	verifyPermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { AutoSyncEventSchema, SyncModeSchema } from "../types";

/**
 * Update connection settings (sync mode, auto-sync events, name).
 */
export const updateConnection = protectedProcedure
	.route({
		method: "PATCH",
		path: "/integrations/connections/:id",
		tags: ["Integrations"],
		summary: "Update connection settings",
		description: "Update sync mode and other settings for a connection",
	})
	.input(
		z.object({
			id: z.string(),
			syncMode: SyncModeSchema.optional(),
			autoSyncEvents: z.array(AutoSyncEventSchema).optional(),
			name: z.string().max(100).optional(),
		}),
	)
	.handler(
		async ({
			context: { user },
			input: { id, syncMode, autoSyncEvents, name },
		}) => {
			// Get the connection
			const connection = await db.integrationConnection.findUnique({
				where: { id },
				select: {
					id: true,
					organizationId: true,
					syncMode: true,
					autoSyncEvents: true,
					name: true,
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

			// Check permission to update connections
			const permContext = getPermissionContext(
				user.id,
				connection.organizationId,
				membership.role,
			);
			verifyPermission(permContext, "connections", "update");

			// Build update data
			const updateData: {
				syncMode?: string;
				autoSyncEvents?: string[];
				name?: string;
				updatedAt: Date;
			} = {
				updatedAt: new Date(),
			};

			if (syncMode !== undefined) {
				updateData.syncMode = syncMode;
			}

			if (autoSyncEvents !== undefined) {
				updateData.autoSyncEvents = autoSyncEvents;
			}

			if (name !== undefined) {
				updateData.name = name;
			}

			// Update the connection
			const updated = await db.integrationConnection.update({
				where: { id },
				data: updateData,
				select: {
					id: true,
					providerConfigKey: true,
					providerName: true,
					name: true,
					syncMode: true,
					autoSyncEvents: true,
					status: true,
					lastSyncAt: true,
					lastError: true,
					createdAt: true,
					updatedAt: true,
				},
			});

			return { connection: updated };
		},
	);
