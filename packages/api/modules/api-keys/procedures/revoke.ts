import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { apiKeyAudit, getAuditContextFromHeaders } from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const revokeApiKey = protectedProcedure
	.route({
		method: "POST",
		path: "/api-keys/{id}/revoke",
		tags: ["API Keys"],
		summary: "Revoke an API key",
		description: "Revoke an existing API key",
	})
	.input(
		z.object({
			id: z.string(),
		}),
	)
	.handler(async ({ context: { user, headers }, input: { id } }) => {
		// Find the API key
		const apiKey = await db.apiKey.findUnique({
			where: { id },
			select: {
				id: true,
				name: true,
				organizationId: true,
				revokedAt: true,
			},
		});

		if (!apiKey) {
			throw new ORPCError("NOT_FOUND", { message: "API key not found" });
		}

		if (apiKey.revokedAt) {
			throw new ORPCError("BAD_REQUEST", {
				message: "API key is already revoked",
			});
		}

		// Verify membership and permissions
		const membership = await verifyOrganizationMembership(
			apiKey.organizationId,
			user.id,
		);

		if (!membership) {
			throw new ORPCError("FORBIDDEN");
		}

		// Only admins/owners can revoke API keys
		if (membership.role !== "owner" && membership.role !== "admin") {
			throw new ORPCError("FORBIDDEN", {
				message: "Only organization admins can revoke API keys",
			});
		}

		// Revoke the key
		await db.apiKey.update({
			where: { id },
			data: { revokedAt: new Date() },
		});

		// Audit log the API key revocation
		const auditContext = getAuditContextFromHeaders(headers);
		apiKeyAudit.revoked(
			apiKey.id,
			user.id,
			apiKey.organizationId,
			auditContext,
			{ name: apiKey.name },
		);

		return { success: true };
	});
