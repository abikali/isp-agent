import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { normalizeArea } from "@repo/utils";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { FIBER_AREA_STATUSES } from "../lib/constants";

/** Mark where Ogero/Ministry boxes are going in — drives the risk score. */
export const setFiberAreaStatus = protectedProcedure
	.route({
		method: "POST",
		path: "/fiber/areas",
		tags: ["Fiber"],
		summary: "Set an area's fiber status",
	})
	.input(
		z.object({
			organizationId: z.string(),
			area: z.string().trim().min(1).max(120),
			status: z.enum(FIBER_AREA_STATUSES),
			notes: z.string().trim().max(500).nullable().optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"marketing",
			"manage",
		);
		const area = normalizeArea(input.area) ?? input.area.toLowerCase();
		await db.fiberArea.upsert({
			where: {
				organizationId_area: {
					organizationId: input.organizationId,
					area,
				},
			},
			create: {
				organizationId: input.organizationId,
				area,
				status: input.status,
				notes: input.notes ?? null,
			},
			update: {
				status: input.status,
				...(input.notes !== undefined ? { notes: input.notes } : {}),
			},
		});
		return { area, status: input.status };
	});
