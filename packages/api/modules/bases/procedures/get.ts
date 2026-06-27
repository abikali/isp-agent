import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { baseSelect, mapBaseWorkers } from "../lib/base-helpers";

export const getBase = protectedProcedure
	.route({
		method: "GET",
		path: "/bases/{id}",
		tags: ["Bases"],
		summary: "Get a single base",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"bases",
			"read",
		);

		const base = await db.base.findFirst({
			where: {
				id: input.id,
				organizationId: input.organizationId,
				...getDealerScopeFilter(activeDealerId),
			},
			select: baseSelect,
		});

		if (!base) {
			throw new ORPCError("NOT_FOUND", { message: "Base not found" });
		}

		return { base: mapBaseWorkers(base) };
	});
