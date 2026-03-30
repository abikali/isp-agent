import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { dateRangeSchema, paginationSchema } from "../lib/schemas";

export const listCollections = protectedProcedure
	.route({
		method: "GET",
		path: "/billing/collections",
		tags: ["Billing"],
		summary: "List cash collection records with optional filters",
	})
	.input(
		z
			.object({
				organizationId: z.string(),
				collectorId: z.string().optional(),
			})
			.merge(dateRangeSchema)
			.merge(paginationSchema()),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);

		const where: Record<string, unknown> = {
			organizationId: input.organizationId,
			collector: { dealerId: activeDealerId ?? null },
		};

		if (input.collectorId) {
			where["collectorId"] = input.collectorId;
		}

		if (input.dateFrom || input.dateTo) {
			const collectedAt: Record<string, Date> = {};
			if (input.dateFrom) {
				collectedAt["gte"] = new Date(input.dateFrom);
			}
			if (input.dateTo) {
				const to = new Date(input.dateTo);
				to.setHours(23, 59, 59, 999);
				collectedAt["lte"] = to;
			}
			where["collectedAt"] = collectedAt;
		}

		const [collections, total] = await Promise.all([
			db.cashCollection.findMany({
				where,
				include: {
					collector: { select: { id: true, name: true } },
					receivedBy: { select: { id: true, name: true } },
				},
				orderBy: { collectedAt: "desc" },
				skip: (input.page - 1) * input.pageSize,
				take: input.pageSize,
			}),
			db.cashCollection.count({ where }),
		]);

		return {
			collections,
			total,
			page: input.page,
			pageSize: input.pageSize,
			totalPages: Math.ceil(total / input.pageSize),
		};
	});
