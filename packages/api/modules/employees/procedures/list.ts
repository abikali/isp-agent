import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const listEmployees = protectedProcedure
	.route({
		method: "GET",
		path: "/employees",
		tags: ["Employees"],
		summary: "List employees with pagination, search, and filters",
	})
	.input(
		z.object({
			organizationId: z.string(),
			search: z.string().optional(),
			status: z.enum(["ACTIVE", "INACTIVE", "ON_LEAVE"]).optional(),
			department: z
				.enum([
					"TECHNICAL",
					"CUSTOMER_SERVICE",
					"BILLING",
					"MANAGEMENT",
					"FIELD_OPS",
				])
				.optional(),
			stationId: z.string().optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(10).max(100).default(25),
			sortBy: z
				.enum(["name", "employeeNumber", "createdAt", "status"])
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
		if (input.department) {
			where["department"] = input.department;
		}
		if (input.stationId) {
			where["stations"] = {
				some: { stationId: input.stationId },
			};
		}
		if (input.search) {
			where["OR"] = [
				{ name: { contains: input.search, mode: "insensitive" } },
				{ email: { contains: input.search, mode: "insensitive" } },
				{ phone: { contains: input.search, mode: "insensitive" } },
				{
					employeeNumber: {
						contains: input.search,
						mode: "insensitive",
					},
				},
			];
		}

		const [employees, total] = await Promise.all([
			db.employee.findMany({
				where,
				select: {
					id: true,
					employeeNumber: true,
					name: true,
					email: true,
					phone: true,
					position: true,
					department: true,
					status: true,
					hireDate: true,
					createdAt: true,
					stations: {
						select: {
							station: {
								select: {
									id: true,
									name: true,
								},
							},
						},
					},
				},
				orderBy: { [input.sortBy]: input.sortOrder },
				skip: (input.page - 1) * input.pageSize,
				take: input.pageSize,
			}),
			db.employee.count({ where }),
		]);

		return {
			employees,
			total,
			page: input.page,
			pageSize: input.pageSize,
			totalPages: Math.ceil(total / input.pageSize),
		};
	});
