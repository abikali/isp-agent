import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import {
	getPermissionContext,
	verifyPermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { getNangoClient, isNangoConfigured } from "../lib/nango";

/**
 * Delete (disconnect) an integration connection.
 * Also removes the connection from Nango.
 */
export const deleteConnection = protectedProcedure
	.route({
		method: "DELETE",
		path: "/integrations/connections/:id",
		tags: ["Integrations"],
		summary: "Delete connection",
		description: "Disconnect and delete an integration connection",
	})
	.input(
		z.object({
			id: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input: { id } }) => {
		// Get the connection
		const connection = await db.integrationConnection.findUnique({
			where: { id },
			select: {
				id: true,
				organizationId: true,
				providerConfigKey: true,
				connectionId: true,
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

		// Check permission to delete connections
		const permContext = getPermissionContext(
			user.id,
			connection.organizationId,
			membership.role,
		);
		verifyPermission(permContext, "connections", "delete");

		// Delete from Nango if configured
		if (isNangoConfigured()) {
			try {
				const nango = getNangoClient();
				await nango.deleteConnection(
					connection.providerConfigKey,
					connection.connectionId,
				);
			} catch {
				// Ignore Nango errors - connection may already be deleted there
			}
		}

		// Delete from database (cascades to sync operations)
		await db.integrationConnection.delete({
			where: { id },
		});

		return { success: true };
	});
