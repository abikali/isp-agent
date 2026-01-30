import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import {
	getOwnershipFilter,
	getPermissionContext,
} from "@repo/api/lib/permission";
import { db, getOrganizationById } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const listApiKeys = protectedProcedure
	.route({
		method: "GET",
		path: "/api-keys/{organizationId}",
		tags: ["API Keys"],
		summary: "List organization API keys",
		description: "List all API keys for an organization",
	})
	.input(
		z.object({
			organizationId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input: { organizationId } }) => {
		const organization = await getOrganizationById(organizationId);

		if (!organization) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Organization not found",
			});
		}

		// Verify membership
		const member = await verifyOrganizationMembership(
			organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "You must be a member of this organization",
			});
		}

		// Get permission context for ownership filtering
		// Admins/owners see all keys, members with "own" scope see only their own
		const permContext = getPermissionContext(
			user.id,
			organizationId,
			member.role,
		);
		const ownershipFilter = getOwnershipFilter(
			permContext,
			"apiKeys",
			"read",
			"createdById",
		);

		const apiKeys = await db.apiKey.findMany({
			where: {
				organizationId,
				revokedAt: null, // Don't show revoked keys
				...ownershipFilter, // Adds createdById filter for members
			},
			select: {
				id: true,
				name: true,
				keyPrefix: true,
				permissions: true,
				expiresAt: true,
				lastUsedAt: true,
				createdAt: true,
				user: {
					select: {
						id: true,
						name: true,
						email: true,
					},
				},
			},
			orderBy: { createdAt: "desc" },
		});

		return { apiKeys };
	});
