import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import {
	getPermissionContext,
	verifyPermission,
} from "@repo/api/lib/permission";
import { db, getOrganizationById } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

/**
 * List all integration connections for an organization.
 */
export const listConnections = protectedProcedure
	.route({
		method: "GET",
		path: "/integrations/connections",
		tags: ["Integrations"],
		summary: "List integration connections",
		description: "List all integration connections for an organization",
	})
	.input(
		z.object({
			organizationId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input: { organizationId } }) => {
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

		// Check permission to read connections
		const permContext = getPermissionContext(
			user.id,
			organizationId,
			membership.role,
		);
		verifyPermission(permContext, "connections", "read");

		// Get all connections for the organization
		const connections = await db.integrationConnection.findMany({
			where: { organizationId },
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
				createdBy: {
					select: {
						id: true,
						name: true,
						image: true,
					},
				},
				_count: {
					select: {
						syncOperations: true,
					},
				},
			},
			orderBy: { createdAt: "desc" },
		});

		return { connections };
	});
