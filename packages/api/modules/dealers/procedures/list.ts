import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const listDealers = protectedProcedure
	.route({
		method: "GET",
		path: "/dealers",
		tags: ["Dealers"],
		summary: "List dealers with pagination, search, and filters",
	})
	.input(
		z.object({
			organizationId: z.string(),
			search: z.string().optional(),
			status: z
				.enum(["ACTIVE", "INACTIVE", "SUSPENDED", "PENDING"])
				.optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(10).max(100).default(25),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"dealers",
			"read",
		);

		const where: Record<string, unknown> = {
			organizationId: input.organizationId,
		};

		if (input.status) {
			where["status"] = input.status;
		}
		if (input.search) {
			where["OR"] = [
				{ name: { contains: input.search, mode: "insensitive" } },
				{ username: { contains: input.search, mode: "insensitive" } },
				{
					companyName: {
						contains: input.search,
						mode: "insensitive",
					},
				},
				{ email: { contains: input.search, mode: "insensitive" } },
				{ phone: { contains: input.search, mode: "insensitive" } },
			];
		}

		const [dealers, total] = await Promise.all([
			db.ispDealer.findMany({
				where,
				select: {
					id: true,
					name: true,
					username: true,
					email: true,
					phone: true,
					companyName: true,
					credit: true,
					commission: true,
					status: true,
					createdAt: true,
					parentDealer: { select: { id: true, name: true } },
					_count: { select: { customers: true, employees: true } },
				},
				orderBy: { name: "asc" },
				skip: (input.page - 1) * input.pageSize,
				take: input.pageSize,
			}),
			db.ispDealer.count({ where }),
		]);

		return {
			dealers,
			total,
			page: input.page,
			pageSize: input.pageSize,
			totalPages: Math.ceil(total / input.pageSize),
		};
	});
