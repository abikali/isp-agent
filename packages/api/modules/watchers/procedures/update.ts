import { ORPCError } from "@orpc/server";
import { checkOrganizationAdmin } from "@repo/api/lib/membership";
import { getAuditContextFromHeaders, watcherAudit } from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { notificationConfigSchema } from "../lib/notification-config-schema";

export const update = protectedProcedure
	.route({
		method: "POST",
		path: "/watchers/{watcherId}",
		tags: ["Watchers"],
		summary: "Update a watcher",
	})
	.input(
		z.object({
			organizationId: z.string(),
			watcherId: z.string(),
			name: z.string().min(1).max(100).optional(),
			target: z.string().min(1).max(500).optional(),
			config: z
				.object({
					port: z.number().int().min(1).max(65535).optional(),
					expectedStatus: z.number().int().optional(),
					method: z.string().optional(),
					recordType: z.string().optional(),
					headers: z.record(z.string(), z.string()).optional(),
				})
				.optional(),
			intervalSeconds: z
				.number()
				.int()
				.refine((v) => [60, 300, 900, 1800, 3600].includes(v), {
					message:
						"Interval must be 60, 300, 900, 1800, or 3600 seconds",
				})
				.optional(),
			notificationConfig: notificationConfigSchema.optional(),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const member = await checkOrganizationAdmin(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only organization admins can update watchers",
			});
		}

		const existing = await db.watcher.findFirst({
			where: {
				id: input.watcherId,
				organizationId: input.organizationId,
			},
		});
		if (!existing) {
			throw new ORPCError("NOT_FOUND", {
				message: "Watcher not found",
			});
		}

		const updateData: Record<string, unknown> = {};
		if (input.name !== undefined) {
			updateData["name"] = input.name;
		}
		if (input.target !== undefined) {
			updateData["target"] = input.target;
		}
		if (input.config !== undefined) {
			updateData["config"] = input.config ?? null;
		}
		if (input.intervalSeconds !== undefined) {
			updateData["intervalSeconds"] = input.intervalSeconds;
		}
		if (input.notificationConfig !== undefined) {
			updateData["notificationConfig"] = input.notificationConfig;
		}

		const watcher = await db.watcher.update({
			where: { id: input.watcherId },
			data: updateData,
		});

		const auditContext = getAuditContextFromHeaders(headers);
		watcherAudit.updated(
			input.watcherId,
			user.id,
			input.organizationId,
			auditContext,
		);

		return { watcher };
	});
