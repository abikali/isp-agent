import { ORPCError } from "@orpc/server";
import {
	getOwnershipFilterAsync,
	requirePermission,
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

		const { permCtx } = await requirePermission(
			organizationId,
			user.id,
			"apiKeys",
			"read",
		);
		const ownershipFilter = await getOwnershipFilterAsync(
			permCtx,
			"apiKeys",
			"read",
		);

		const apiKeys = await db.apiKey.findMany({
			where: {
				organizationId,
				revokedAt: null,
				...ownershipFilter,
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
