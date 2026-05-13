import { encryptToken } from "@repo/ai";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const upsertIntegration = protectedProcedure
	.route({
		method: "POST",
		path: "/marketing/integration",
		tags: ["Marketing"],
		summary: "Create or update the Salti integration for an organization",
	})
	.input(
		z.object({
			organizationId: z.string(),
			apiEndpoint: z
				.string()
				.url()
				.default("https://saltimarketing.com/"),
			apiToken: z.string().min(8),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"marketing",
			"manage",
		);

		const encryptedApiToken = encryptToken(input.apiToken);

		const integration = await db.saltiIntegration.upsert({
			where: { organizationId: input.organizationId },
			create: {
				organizationId: input.organizationId,
				apiEndpoint: input.apiEndpoint,
				encryptedApiToken,
			},
			update: {
				apiEndpoint: input.apiEndpoint,
				encryptedApiToken,
				lastTestedAt: null,
				lastTestStatus: null,
			},
			select: {
				id: true,
				apiEndpoint: true,
				lastTestedAt: true,
				lastTestStatus: true,
				createdAt: true,
				updatedAt: true,
			},
		});

		return { integration };
	});
