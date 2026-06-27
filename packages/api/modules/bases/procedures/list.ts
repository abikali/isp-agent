import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { baseSelect, mapBaseWorkers } from "../lib/base-helpers";

export const listBases = protectedProcedure
	.route({
		method: "GET",
		path: "/bases",
		tags: ["Bases"],
		summary: "List bases for an organization",
	})
	.input(
		z.object({
			organizationId: z.string(),
			search: z.string().optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"bases",
			"read",
		);

		const where: Record<string, unknown> = {
			organizationId: input.organizationId,
			...getDealerScopeFilter(activeDealerId),
		};
		if (input.search) {
			where["OR"] = [
				{ name: { contains: input.search, mode: "insensitive" } },
				{ address: { contains: input.search, mode: "insensitive" } },
			];
		}

		const rows = await db.base.findMany({
			where,
			select: baseSelect,
			orderBy: { name: "asc" },
		});

		return { bases: rows.map(mapBaseWorkers) };
	});
