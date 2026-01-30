import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import {
	getPermissionContext,
	verifyPermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { getProvider } from "../lib/providers";

/**
 * Trigger a contact sync to an integration.
 * Queues a background job to push contacts to the provider.
 */
export const syncContacts = protectedProcedure
	.route({
		method: "POST",
		path: "/integrations/connections/:id/sync",
		tags: ["Integrations"],
		summary: "Sync contacts",
		description: "Trigger a contact sync to the integration",
	})
	.input(
		z.object({
			connectionId: z.string(),
			contactIds: z.array(z.string()).optional(), // If not provided, sync all
		}),
	)
	.handler(
		async ({ context: { user }, input: { connectionId, contactIds } }) => {
			// Get the connection
			const connection = await db.integrationConnection.findUnique({
				where: { id: connectionId },
				select: {
					id: true,
					organizationId: true,
					providerConfigKey: true,
					status: true,
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

			// Check permission to sync
			const permContext = getPermissionContext(
				user.id,
				connection.organizationId,
				membership.role,
			);
			verifyPermission(permContext, "connections", "sync");

			// Check connection status
			if (connection.status !== "connected") {
				throw new ORPCError("BAD_REQUEST", {
					message: "Connection is not active. Please reconnect.",
				});
			}

			// Validate provider supports contact sync
			const provider = getProvider(connection.providerConfigKey);
			if (!provider?.supportsContactSync) {
				throw new ORPCError("BAD_REQUEST", {
					message: "This integration does not support contact sync",
				});
			}

			// Determine sync type and get contact count
			const totalContacts = contactIds ? contactIds.length : 0;
			const type = contactIds ? "push_bulk" : "sync_all";

			if (totalContacts === 0) {
				throw new ORPCError("BAD_REQUEST", {
					message: "No contacts to sync",
				});
			}

			// Import the job queue dynamically to avoid circular dependencies
			const { queueContactSync } = await import(
				"@repo/jobs/integration-sync"
			);

			// Queue the sync job
			const operationId = await queueContactSync({
				connectionId: connection.id,
				contactIds: contactIds ?? null,
				trigger: "manual",
				type,
			});

			return {
				operationId,
				totalContacts,
				message: `Syncing ${totalContacts} contact${totalContacts === 1 ? "" : "s"}...`,
			};
		},
	);
