import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const deleteIntegration = protectedProcedure
	.route({
		method: "DELETE",
		path: "/marketing/integration",
		tags: ["Marketing"],
		summary: "Remove the Salti integration for an organization",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"marketing",
			"manage",
		);

		await db.saltiIntegration.deleteMany({
			where: { organizationId: input.organizationId },
		});

		return { success: true };
	});
