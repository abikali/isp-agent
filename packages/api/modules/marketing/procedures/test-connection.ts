import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { getSaltiClientForOrg } from "../lib/salti-client";

export const testConnection = protectedProcedure
	.route({
		method: "POST",
		path: "/marketing/integration/test",
		tags: ["Marketing"],
		summary: "Test the Salti integration by calling getTemplates",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"marketing",
			"manage",
		);

		try {
			const client = await getSaltiClientForOrg(input.organizationId);
			const templates = await client.getTemplates();
			await db.saltiIntegration.update({
				where: { organizationId: input.organizationId },
				data: {
					lastTestedAt: new Date(),
					lastTestStatus: "success",
				},
			});
			return { success: true, templateCount: templates.length };
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Unknown error";
			await db.saltiIntegration.update({
				where: { organizationId: input.organizationId },
				data: {
					lastTestedAt: new Date(),
					lastTestStatus: message.slice(0, 500),
				},
			});
			throw new ORPCError("BAD_REQUEST", {
				message: `Salti connection failed: ${message}`,
			});
		}
	});
