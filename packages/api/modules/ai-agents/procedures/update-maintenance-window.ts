import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

const WINDOW_SELECT = {
	id: true,
	startsAt: true,
	endsAt: true,
	message: true,
} as const;

export const updateMaintenanceWindow = protectedProcedure
	.route({
		method: "POST",
		path: "/ai-agents/maintenance-windows/{windowId}",
		tags: ["AI Agents"],
		summary: "Update a scheduled maintenance window",
	})
	.input(
		z.object({
			windowId: z.string(),
			organizationId: z.string(),
			startsAt: z.coerce.date().optional(),
			endsAt: z.coerce.date().optional(),
			message: z.string().min(1).max(2000).optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"aiAgents",
			"update",
		);

		const existing = await db.aiMaintenanceWindow.findFirst({
			where: { id: input.windowId },
			include: { agent: { select: { organizationId: true } } },
		});
		if (
			!existing ||
			existing.agent.organizationId !== input.organizationId
		) {
			throw new ORPCError("NOT_FOUND", {
				message: "Maintenance window not found",
			});
		}

		// Validate the resulting range using the merged (new ?? existing) values.
		const startsAt = input.startsAt ?? existing.startsAt;
		const endsAt = input.endsAt ?? existing.endsAt;
		if (endsAt <= startsAt) {
			throw new ORPCError("BAD_REQUEST", {
				message: "The end time must be after the start time",
			});
		}

		// Build the patch with bracket notation so we never pass `undefined`
		// (Prisma `strictUndefinedChecks` throws on explicit undefined).
		const data: Record<string, unknown> = {};
		if (input.startsAt !== undefined) {
			data["startsAt"] = input.startsAt;
		}
		if (input.endsAt !== undefined) {
			data["endsAt"] = input.endsAt;
		}
		if (input.message !== undefined) {
			data["message"] = input.message;
		}

		const window = await db.aiMaintenanceWindow.update({
			where: { id: input.windowId },
			data,
			select: WINDOW_SELECT,
		});

		return { window };
	});
