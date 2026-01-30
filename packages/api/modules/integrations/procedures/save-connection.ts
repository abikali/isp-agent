import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import {
	getPermissionContext,
	verifyPermission,
} from "@repo/api/lib/permission";
import { db, getOrganizationById } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { getNangoClient, isNangoConfigured } from "../lib/nango";
import { getProvider } from "../lib/providers";

/**
 * Save a connection after successful OAuth flow.
 * Called from the frontend after Nango OAuth completes.
 */
export const saveConnection = protectedProcedure
	.route({
		method: "POST",
		path: "/integrations/connections",
		tags: ["Integrations"],
		summary: "Save integration connection",
		description: "Save a new integration connection after OAuth",
	})
	.input(
		z.object({
			organizationId: z.string(),
			providerConfigKey: z.string(),
			connectionId: z.string(),
		}),
	)
	.handler(
		async ({
			context: { user },
			input: { organizationId, providerConfigKey, connectionId },
		}) => {
			// Check if Nango is configured
			if (!isNangoConfigured()) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Integrations are not configured",
				});
			}

			// Validate organization exists
			const organization = await getOrganizationById(organizationId);
			if (!organization) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Organization not found",
				});
			}

			// Verify membership
			const membership = await verifyOrganizationMembership(
				organizationId,
				user.id,
			);
			if (!membership) {
				throw new ORPCError("FORBIDDEN", {
					message: "You must be a member of this organization",
				});
			}

			// Check permission to create connections
			const permContext = getPermissionContext(
				user.id,
				organizationId,
				membership.role,
			);
			verifyPermission(permContext, "connections", "create");

			// Validate provider exists
			const provider = getProvider(providerConfigKey);
			if (!provider) {
				throw new ORPCError("BAD_REQUEST", {
					message: `Unknown integration provider: ${providerConfigKey}`,
				});
			}

			// Verify the connection exists in Nango
			const nango = getNangoClient();
			try {
				await nango.getConnection(providerConfigKey, connectionId);
			} catch {
				throw new ORPCError("BAD_REQUEST", {
					message: "Invalid connection. Please try connecting again.",
				});
			}

			// Check if connection already exists
			const existing = await db.integrationConnection.findFirst({
				where: {
					organizationId,
					providerConfigKey,
				},
			});

			if (existing) {
				// Update existing connection
				const updated = await db.integrationConnection.update({
					where: { id: existing.id },
					data: {
						connectionId,
						status: "connected",
						lastError: null,
						updatedAt: new Date(),
					},
				});

				return {
					connection: updated,
					isNew: false,
				};
			}

			// Create new connection
			const connection = await db.integrationConnection.create({
				data: {
					id: createId(),
					organizationId,
					createdById: user.id,
					providerConfigKey,
					connectionId,
					providerName: provider.name,
					syncMode: "manual",
					autoSyncEvents: [],
					status: "connected",
					updatedAt: new Date(),
				},
			});

			return {
				connection,
				isNew: true,
			};
		},
	);
