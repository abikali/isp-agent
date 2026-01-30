import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import {
	getPermissionContext,
	verifyPermission,
} from "@repo/api/lib/permission";
import { getOrganizationById } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { getNangoClient, isNangoConfigured } from "../lib/nango";
import { getProvider } from "../lib/providers";

/**
 * Create a Nango connect session for OAuth flow.
 * Returns a session token that can be used with the Nango frontend SDK.
 */
export const createSession = protectedProcedure
	.route({
		method: "POST",
		path: "/integrations/session",
		tags: ["Integrations"],
		summary: "Create integration session",
		description:
			"Create a Nango OAuth session for connecting an integration",
	})
	.input(
		z.object({
			organizationId: z.string(),
			providerConfigKey: z.string(),
		}),
	)
	.handler(
		async ({
			context: { user },
			input: { organizationId, providerConfigKey },
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

			// Create Nango session
			const nango = getNangoClient();

			// Use organization ID as the end user identifier
			// This groups all connections for an org together in Nango
			const result = await nango.createConnectSession({
				end_user: {
					id: organizationId,
					display_name: organization.name,
				},
				allowed_integrations: [providerConfigKey],
			});

			return {
				sessionToken: result.data.token,
				expiresAt: result.data.expires_at,
			};
		},
	);
