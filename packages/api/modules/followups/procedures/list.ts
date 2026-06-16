import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const listFollowups = protectedProcedure
	.route({
		method: "GET",
		path: "/followups",
		tags: ["Followups"],
		summary: "List customer follow-ups",
	})
	.input(
		z.object({
			organizationId: z.string(),
			isDone: z.boolean().optional(),
			status: z.string().max(100).optional(),
			search: z.string().optional(),
			customerId: z.string().optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(10).max(100).default(25),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"followups",
			"read",
		);

		// Customer-linked follow-ups scope to the active dealer; manual
		// (customer-less) follow-ups are org-level and always visible.
		const dealerScope = {
			OR: [
				{ customerId: null },
				{ customer: getDealerScopeFilter(activeDealerId) },
			],
		};

		const andClauses: Record<string, unknown>[] = [dealerScope];
		if (input.search) {
			andClauses.push({
				OR: [
					{
						customerName: {
							contains: input.search,
							mode: "insensitive",
						},
					},
					{
						customerUsername: {
							contains: input.search,
							mode: "insensitive",
						},
					},
					{ mobile: { contains: input.search, mode: "insensitive" } },
					{
						groupName: {
							contains: input.search,
							mode: "insensitive",
						},
					},
				],
			});
		}

		const where: Record<string, unknown> = {
			organizationId: input.organizationId,
			AND: andClauses,
		};
		if (input.isDone !== undefined) {
			where["isDone"] = input.isDone;
		}
		if (input.status) {
			where["status"] = input.status;
		}
		if (input.customerId) {
			where["customerId"] = input.customerId;
		}

		const [followups, total, statusGroups] = await Promise.all([
			db.followup.findMany({
				where,
				include: {
					customer: {
						select: {
							id: true,
							firstName: true,
							lastName: true,
							accountNumber: true,
						},
					},
				},
				orderBy: [{ isDone: "asc" }, { createdAt: "desc" }],
				skip: (input.page - 1) * input.pageSize,
				take: input.pageSize,
			}),
			db.followup.count({ where }),
			db.followup.groupBy({
				by: ["status"],
				where: {
					organizationId: input.organizationId,
					isDone: false,
					AND: [dealerScope],
				},
				_count: true,
			}),
		]);

		return {
			followups,
			total,
			statusCounts: statusGroups.map((g) => ({
				status: g.status,
				count: g._count,
			})),
			page: input.page,
			pageSize: input.pageSize,
			totalPages: Math.ceil(total / input.pageSize),
		};
	});
