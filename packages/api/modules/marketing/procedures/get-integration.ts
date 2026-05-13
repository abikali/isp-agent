import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const getIntegration = protectedProcedure
	.route({
		method: "GET",
		path: "/marketing/integration",
		tags: ["Marketing"],
		summary: "Get the Salti integration status for an organization",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"marketing",
			"read",
		);

		const integration = await db.saltiIntegration.findUnique({
			where: { organizationId: input.organizationId },
			select: {
				id: true,
				apiEndpoint: true,
				lastTestedAt: true,
				lastTestStatus: true,
				createdAt: true,
				updatedAt: true,
			},
		});

		const envConfigured = Boolean(
			process.env["SALTI_API_TOKEN"] ?? process.env["WPBOX_TOKEN"],
		);

		return {
			isConfigured: integration !== null || envConfigured,
			source:
				integration !== null
					? ("org" as const)
					: envConfigured
						? ("env" as const)
						: ("none" as const),
			integration,
		};
	});
