import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { checkOrganizationAdmin } from "@repo/api/lib/membership";
import { apiKeyAudit, getAuditContextFromHeaders } from "@repo/auth/lib/audit";
import { db, getOrganizationById } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { generateApiKey } from "../lib/hash";
import { ApiKeyPermissionSchema } from "../types";

export const createApiKey = protectedProcedure
	.route({
		method: "POST",
		path: "/api-keys",
		tags: ["API Keys"],
		summary: "Create a new API key",
		description: "Create a new API key for an organization",
	})
	.input(
		z.object({
			organizationId: z.string(),
			name: z.string().min(1).max(100),
			permissions: z.array(ApiKeyPermissionSchema).min(1),
			expiresAt: z.string().datetime().optional(),
		}),
	)
	.handler(
		async ({
			context: { user, headers },
			input: { organizationId, name, permissions, expiresAt },
		}) => {
			const organization = await getOrganizationById(organizationId);

			if (!organization) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Organization not found",
				});
			}

			// Only admins/owners can create API keys
			const member = await checkOrganizationAdmin(
				organizationId,
				user.id,
			);
			if (!member) {
				throw new ORPCError("FORBIDDEN", {
					message: "Only organization admins can create API keys",
				});
			}

			// Generate the key
			const { plainKey, keyHash, keyPrefix } = generateApiKey();

			// Store in database
			const apiKey = await db.apiKey.create({
				data: {
					id: createId(),
					name,
					keyHash,
					keyPrefix,
					organizationId,
					createdById: user.id,
					permissions,
					expiresAt: expiresAt ? new Date(expiresAt) : null,
				},
				select: {
					id: true,
					name: true,
					keyPrefix: true,
					permissions: true,
					expiresAt: true,
					createdAt: true,
				},
			});

			// Audit log the API key creation
			const auditContext = getAuditContextFromHeaders(headers);
			apiKeyAudit.created(
				apiKey.id,
				user.id,
				organizationId,
				auditContext,
				{
					name,
					permissions,
				},
			);

			// Return the plain key only once - it cannot be retrieved later
			return {
				...apiKey,
				key: plainKey, // Only shown once!
			};
		},
	);
