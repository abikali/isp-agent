import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const listStockLogs = protectedProcedure
	.route({
		method: "GET",
		path: "/stock/logs",
		tags: ["Stock"],
		summary: "List stock movement audit log",
	})
	.input(
		z.object({
			organizationId: z.string(),
			stockItemId: z.string().optional(),
			employeeId: z.string().optional(),
			action: z
				.enum([
					"ADD",
					"REMOVE",
					"TRANSFER_TO_WORKER",
					"TRANSFER_FROM_WORKER",
					"ADJUST",
					"DELIVER",
				])
				.optional(),
			from: z.coerce.date().optional(),
			to: z.coerce.date().optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(10).max(100).default(50),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"inventory",
			"read",
		);

		const where: Record<string, unknown> = {
			organizationId: input.organizationId,
		};
		if (input.stockItemId) {
			where["stockItemId"] = input.stockItemId;
		}
		if (input.employeeId) {
			where["employeeId"] = input.employeeId;
		}
		if (input.action) {
			where["action"] = input.action;
		}
		if (input.from || input.to) {
			where["createdAt"] = {
				...(input.from ? { gte: input.from } : {}),
				...(input.to ? { lte: input.to } : {}),
			};
		}

		const [logs, total] = await Promise.all([
			db.stockLog.findMany({
				where,
				include: {
					employee: { select: { id: true, name: true } },
					performedBy: { select: { id: true, name: true } },
				},
				orderBy: { createdAt: "desc" },
				skip: (input.page - 1) * input.pageSize,
				take: input.pageSize,
			}),
			db.stockLog.count({ where }),
		]);

		return {
			logs,
			total,
			page: input.page,
			pageSize: input.pageSize,
			totalPages: Math.ceil(total / input.pageSize),
		};
	});
