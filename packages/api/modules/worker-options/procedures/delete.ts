import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { CUSTOM_RESOLUTION_VALUE } from "@repo/database/worker-options";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const deleteWorkerOption = protectedProcedure
	.route({
		method: "DELETE",
		path: "/worker-options/{id}",
		tags: ["Worker Options"],
		summary: "Delete a worker-portal dropdown option",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"organization",
			"update",
		);

		const existing = await db.workerOption.findFirst({
			where: { id: input.id, organizationId: input.organizationId },
		});

		if (!existing) {
			throw new ORPCError("NOT_FOUND", {
				message: "Option not found",
			});
		}

		// "Other" is the escape hatch that forces a free-text note; removing it
		// would leave workers unable to report anything off-list.
		if (
			existing.listKey === "TASK_RESOLUTION" &&
			existing.value === CUSTOM_RESOLUTION_VALUE
		) {
			throw new ORPCError("BAD_REQUEST", {
				message:
					'The "Other" resolution cannot be deleted — workers need it to report anything off-list. Rename its label instead.',
			});
		}

		await db.workerOption.delete({ where: { id: input.id } });

		return { success: true };
	});
