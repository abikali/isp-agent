import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { db } from "@repo/database";
import { WORKER_OPTION_LIST_KEYS } from "@repo/database/worker-options";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

/**
 * Every worker-portal dropdown for an organization, grouped by list key.
 *
 * Readable by any member — field workers need it to render their own forms,
 * and they hold no settings permission.
 */
export const listWorkerOptions = protectedProcedure
	.route({
		method: "GET",
		path: "/worker-options",
		tags: ["Worker Options"],
		summary: "List the admin-managed worker-portal dropdown options",
	})
	.input(
		z.object({
			organizationId: z.string(),
			listKey: z.enum(WORKER_OPTION_LIST_KEYS).optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await verifyOrganizationMembership(input.organizationId, user.id);

		const options = await db.workerOption.findMany({
			where: {
				organizationId: input.organizationId,
				...(input.listKey ? { listKey: input.listKey } : {}),
			},
			orderBy: [{ listKey: "asc" }, { sortOrder: "asc" }],
		});

		return { options };
	});
