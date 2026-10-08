import { requirePermission } from "@repo/api/lib/permission";
import { runFiberSignalSweep } from "@repo/jobs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

/**
 * Re-run the signal sweep over the last N days for this org — the backfill
 * after first deploy, or after the patterns change. Idempotent.
 */
export const rescanFiberSignals = protectedProcedure
	.route({
		method: "POST",
		path: "/fiber/rescan",
		tags: ["Fiber"],
		summary: "Find fiber leads in recent chats, stops and escalations",
	})
	.input(
		z.object({
			organizationId: z.string(),
			days: z.number().int().min(1).max(90).default(60),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"marketing",
			"manage",
		);
		return runFiberSignalSweep({
			since: new Date(Date.now() - input.days * 86_400_000),
			organizationId: input.organizationId,
		});
	});
