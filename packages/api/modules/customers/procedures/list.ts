import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const listCustomers = protectedProcedure
	.route({
		method: "GET",
		path: "/customers",
		tags: ["Customers"],
		summary: "List customers with pagination, search, and filters",
	})
	.input(
		z.object({
			organizationId: z.string(),
			search: z.string().optional(),
			status: z
				.enum(["ACTIVE", "INACTIVE", "SUSPENDED", "PENDING"])
				.optional(),
			planId: z.string().optional(),
			stationId: z.string().optional(),
			connectionType: z
				.enum(["FIBER", "WIRELESS", "DSL", "CABLE", "ETHERNET"])
				.optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(10).max(100).default(25),
			sortBy: z
				.enum(["fullName", "accountNumber", "createdAt", "status"])
				.default("createdAt"),
			sortOrder: z.enum(["asc", "desc"]).default("desc"),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const member = await verifyOrganizationMembership(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "You must be a member of this organization",
			});
		}

		const where: Record<string, unknown> = {
			organizationId: input.organizationId,
		};

		if (input.status) {
			where["status"] = input.status;
		}
		if (input.planId) {
			where["planId"] = input.planId;
		}
		if (input.stationId) {
			where["stationId"] = input.stationId;
		}
		if (input.connectionType) {
			where["connectionType"] = input.connectionType;
		}
		if (input.search) {
			where["OR"] = [
				{ fullName: { contains: input.search, mode: "insensitive" } },
				{ email: { contains: input.search, mode: "insensitive" } },
				{ phone: { contains: input.search, mode: "insensitive" } },
				{
					accountNumber: {
						contains: input.search,
						mode: "insensitive",
					},
				},
			];
		}

		const [customers, total] = await Promise.all([
			db.customer.findMany({
				where,
				select: {
					id: true,
					accountNumber: true,
					fullName: true,
					email: true,
					phone: true,
					status: true,
					connectionType: true,
					ipAddress: true,
					monthlyRate: true,
					balance: true,
					createdAt: true,
					plan: {
						select: {
							id: true,
							name: true,
							monthlyPrice: true,
						},
					},
					station: {
						select: {
							id: true,
							name: true,
						},
					},
				},
				orderBy: { [input.sortBy]: input.sortOrder },
				skip: (input.page - 1) * input.pageSize,
				take: input.pageSize,
			}),
			db.customer.count({ where }),
		]);

		return {
			customers,
			total,
			page: input.page,
			pageSize: input.pageSize,
			totalPages: Math.ceil(total / input.pageSize),
		};
	});
