import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { buildDateRangeFilter } from "../lib/filters";
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
				sortBy: z
					.enum(["collectedAt", "amount", "type"])
					.default("collectedAt"),
				sortOrder: z.enum(["asc", "desc"]).default("desc"),
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

		const dateRange = buildDateRangeFilter(input.dateFrom, input.dateTo);
		if (dateRange) {
			where["collectedAt"] = dateRange;
		}

		const [collections, total] = await Promise.all([
			db.cashCollection.findMany({
				where,
				include: {
					collector: { select: { id: true, name: true } },
					receivedBy: { select: { id: true, name: true } },
					// New-user-setup rows link to the subscriber the setup
					// created. The delete dialog offers to cut him off along
					// with the revert, so it needs his name and current status.
					setupRequest: {
						select: {
							customer: {
								select: {
									id: true,
									firstName: true,
									lastName: true,
									username: true,
									status: true,
								},
							},
						},
					},
				},
				orderBy: { [input.sortBy]: input.sortOrder },
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
