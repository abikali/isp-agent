import { requirePermission } from "@repo/api/lib/permission";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { getSaltiClientForOrg } from "../lib/salti-client";

export const listGroups = protectedProcedure
	.route({
		method: "GET",
		path: "/marketing/groups",
		tags: ["Marketing"],
		summary: "List Salti contact groups",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"marketing",
			"read",
		);

		const client = await getSaltiClientForOrg(input.organizationId);
		const groups = await client.getGroups();
		return { groups };
	});
