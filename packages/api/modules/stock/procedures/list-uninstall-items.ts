import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

// Admin-curated list of recoverable equipment shown in the worker uninstall
// task's recovered-item dropdown. Unlike `getMyStock`, this is not scoped to
// the worker's own allocations — it returns every org item flagged
// `showInUninstall`, since recovered equipment is the customer's old gear, not
// stock the worker carries.
export const listUninstallItems = protectedProcedure
	.route({
		method: "GET",
		path: "/stock/uninstall-items",
		tags: ["Stock"],
		summary: "List stock items flagged to show on uninstall tasks",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"inventory",
			"read",
		);

		const items = await db.stockItem.findMany({
			where: {
				organizationId: input.organizationId,
				showInUninstall: true,
			},
			select: { id: true, name: true, sellPrice: true },
			orderBy: { name: "asc" },
		});

		return { items };
	});
