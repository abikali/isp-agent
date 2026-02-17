import { ORPCError } from "@orpc/server";
import { checkOrganizationAdmin } from "@repo/api/lib/membership";
import { getAuditContextFromHeaders, watcherAudit } from "@repo/auth/lib/audit";
import { db, Prisma } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { notificationConfigSchema } from "../lib/notification-config-schema";

export const create = protectedProcedure
	.route({
		method: "POST",
		path: "/watchers",
		tags: ["Watchers"],
		summary: "Create a new watcher",
	})
	.input(
		z.object({
			organizationId: z.string(),
			name: z.string().min(1).max(100),
			type: z.enum(["ping", "http", "port", "dns"]),
			target: z.string().min(1).max(500),
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
				}),
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
				message: "Only organization admins can create watchers",
			});
		}

		const watcher = await db.watcher.create({
			data: {
				organizationId: input.organizationId,
				createdById: user.id,
				name: input.name,
				type: input.type,
				target: input.target,
				config: input.config ?? Prisma.JsonNull,
				intervalSeconds: input.intervalSeconds,
				notificationConfig: input.notificationConfig ?? Prisma.JsonNull,
			},
			select: {
				id: true,
				name: true,
				type: true,
				target: true,
				intervalSeconds: true,
				enabled: true,
				status: true,
				createdAt: true,
			},
		});

		const auditContext = getAuditContextFromHeaders(headers);
		watcherAudit.created(
			watcher.id,
			user.id,
			input.organizationId,
			auditContext,
			{
				name: input.name,
				type: input.type,
			},
		);

		return { watcher };
	});
