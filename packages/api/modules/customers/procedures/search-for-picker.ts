import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db, type Prisma } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const searchCustomersForPicker = protectedProcedure
	.route({
		method: "GET",
		path: "/customers/search-for-picker",
		tags: ["Customers"],
		summary:
			"Search customers within the active dealer scope for selection pickers (ignores collector :own scope)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			search: z.string().optional(),
			excludeCustomerId: z.string().optional(),
			pageSize: z.number().int().min(1).max(50).default(20),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"customers",
			"read",
		);

		const where: Prisma.CustomerWhereInput = {
			organizationId: input.organizationId,
			...getDealerScopeFilter(activeDealerId),
		};

		if (input.excludeCustomerId) {
			where.id = { not: input.excludeCustomerId };
		}

		if (input.search) {
			const tokens = input.search
				.trim()
				.split(/\s+/)
				.filter(Boolean)
				.slice(0, 10);
			const nameClauses: Prisma.CustomerWhereInput[] =
				tokens.length > 1
					? [
							{
								AND: tokens.map((token) => ({
									OR: [
										{
											firstName: {
												contains: token,
												mode: "insensitive",
											},
										},
										{
											lastName: {
												contains: token,
												mode: "insensitive",
											},
										},
									],
								})),
							},
						]
					: [
							{
								firstName: {
									contains: input.search,
									mode: "insensitive",
								},
							},
							{
								lastName: {
									contains: input.search,
									mode: "insensitive",
								},
							},
						];
			where.OR = [
				...nameClauses,
				{ username: { contains: input.search, mode: "insensitive" } },
				{
					accountNumber: {
						contains: input.search,
						mode: "insensitive",
					},
				},
			];
		}

		const customers = await db.customer.findMany({
			where,
			select: {
				id: true,
				firstName: true,
				lastName: true,
				username: true,
			},
			orderBy: { lastName: "asc" },
			take: input.pageSize,
		});

		return { customers };
	});
