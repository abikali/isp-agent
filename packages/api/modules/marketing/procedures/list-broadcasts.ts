import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const listBroadcasts = protectedProcedure
	.route({
		method: "GET",
		path: "/marketing/broadcasts",
		tags: ["Marketing"],
		summary: "List marketing broadcasts for an organization",
	})
	.input(
		z.object({
			organizationId: z.string(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(10).max(100).default(25),
			status: z
				.enum([
					"pending",
					"running",
					"completed",
					"failed",
					"cancelled",
				])
				.optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"marketing",
			"read",
		);

		const where: Record<string, unknown> = {
			organizationId: input.organizationId,
		};
		if (input.status) {
			where["status"] = input.status;
		}

		const [total, items] = await Promise.all([
			db.marketingBroadcast.count({ where: where as never }),
			db.marketingBroadcast.findMany({
				where: where as never,
				orderBy: { createdAt: "desc" },
				skip: (input.page - 1) * input.pageSize,
				take: input.pageSize,
				select: {
					id: true,
					name: true,
					templateName: true,
					templateLang: true,
					audienceType: true,
					totalRecipients: true,
					sentCount: true,
					failedCount: true,
					status: true,
					startedAt: true,
					completedAt: true,
					createdAt: true,
				},
			}),
		]);

		return {
			items,
			total,
			page: input.page,
			pageSize: input.pageSize,
		};
	});
