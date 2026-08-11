import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { WORKER_OPTION_LIST_KEYS } from "@repo/database/worker-options";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const createWorkerOption = protectedProcedure
	.route({
		method: "POST",
		path: "/worker-options",
		tags: ["Worker Options"],
		summary: "Create a worker-portal dropdown option",
	})
	.input(
		z.object({
			organizationId: z.string(),
			listKey: z.enum(WORKER_OPTION_LIST_KEYS),
			value: z
				.string()
				.min(1)
				.max(50)
				.regex(
					/^[a-z0-9_]+$/,
					"Must be lowercase letters, numbers, and underscores only",
				),
			label: z.string().min(1).max(100),
			labelAr: z.string().max(100).optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"organization",
			"update",
		);

		const existing = await db.workerOption.findUnique({
			where: {
				organizationId_listKey_value: {
					organizationId: input.organizationId,
					listKey: input.listKey,
					value: input.value,
				},
			},
		});

		if (existing) {
			throw new ORPCError("CONFLICT", {
				message:
					"An option with this value already exists in this list",
			});
		}

		const maxOrder = await db.workerOption.aggregate({
			where: {
				organizationId: input.organizationId,
				listKey: input.listKey,
			},
			_max: { sortOrder: true },
		});

		const option = await db.workerOption.create({
			data: {
				organizationId: input.organizationId,
				listKey: input.listKey,
				value: input.value,
				label: input.label,
				labelAr: input.labelAr ?? null,
				sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
			},
		});

		return { option };
	});
