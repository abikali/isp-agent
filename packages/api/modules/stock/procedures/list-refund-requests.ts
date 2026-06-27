import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const listStockRefundRequests = protectedProcedure
	.route({
		method: "GET",
		path: "/stock/refund-requests",
		tags: ["Stock"],
		summary: "List worker stock-refund requests (admin review)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(10).max(100).default(25),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		// Approving a refund moves warehouse inventory, so it is gated on the
		// admin-level `inventory:delete` capability — field workers only have
		// read+update and must not review (let alone self-approve) refunds.
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"inventory",
			"delete",
		);

		const where: Record<string, unknown> = {
			organizationId: input.organizationId,
			employee: getDealerScopeFilter(activeDealerId),
		};
		if (input.status) {
			where["status"] = input.status;
		}

		const [requests, total, pendingCount] = await Promise.all([
			db.stockRefundRequest.findMany({
				where,
				include: {
					employee: { select: { id: true, name: true } },
					stockItem: { select: { id: true, name: true } },
					reviewedBy: { select: { id: true, name: true } },
				},
				orderBy: { createdAt: "desc" },
				skip: (input.page - 1) * input.pageSize,
				take: input.pageSize,
			}),
			db.stockRefundRequest.count({ where }),
			db.stockRefundRequest.count({
				where: {
					organizationId: input.organizationId,
					employee: getDealerScopeFilter(activeDealerId),
					status: "PENDING",
				},
			}),
		]);

		return {
			requests,
			total,
			pendingCount,
			page: input.page,
			pageSize: input.pageSize,
			totalPages: Math.ceil(total / input.pageSize),
		};
	});
