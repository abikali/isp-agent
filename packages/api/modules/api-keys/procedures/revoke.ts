import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
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

		await requirePermission(
			apiKey.organizationId,
			user.id,
			"apiKeys",
			"delete",
		);

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
