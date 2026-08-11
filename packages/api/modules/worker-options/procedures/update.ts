import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const updateWorkerOption = protectedProcedure
	.route({
		method: "PUT",
		path: "/worker-options/{id}",
		tags: ["Worker Options"],
		summary: "Update a worker-portal dropdown option",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
			label: z.string().min(1).max(100).optional(),
			labelAr: z.string().max(100).optional(),
			sortOrder: z.number().int().min(0).optional(),
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

		// `value` is intentionally immutable — it is stored on historic
		// expense.category / task.resolutionCode rows, so renaming it would
		// orphan their labels. Admins edit the label instead.
		const updateData: Record<string, unknown> = {};
		if (input.label !== undefined) {
			updateData["label"] = input.label;
		}
		if (input.labelAr !== undefined) {
			updateData["labelAr"] = input.labelAr;
		}
		if (input.sortOrder !== undefined) {
			updateData["sortOrder"] = input.sortOrder;
		}

		const option = await db.workerOption.update({
			where: { id: input.id },
			data: updateData,
		});

		return { option };
	});
