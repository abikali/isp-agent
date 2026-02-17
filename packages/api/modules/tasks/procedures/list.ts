import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const listTasks = protectedProcedure
	.route({
		method: "GET",
		path: "/tasks",
		tags: ["Tasks"],
		summary: "List tasks with pagination, search, and filters",
	})
	.input(
		z.object({
			organizationId: z.string(),
			search: z.string().optional(),
			status: z
				.enum([
					"OPEN",
					"IN_PROGRESS",
					"ON_HOLD",
					"COMPLETED",
					"CANCELLED",
				])
				.optional(),
			priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
			category: z
				.enum([
					"INSTALLATION",
					"MAINTENANCE",
					"REPAIR",
					"SUPPORT",
					"BILLING",
					"GENERAL",
				])
				.optional(),
			employeeId: z.string().optional(),
			customerId: z.string().optional(),
			stationId: z.string().optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(10).max(100).default(25),
			sortBy: z
				.enum(["title", "createdAt", "dueDate", "priority", "status"])
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
		if (input.priority) {
			where["priority"] = input.priority;
		}
		if (input.category) {
			where["category"] = input.category;
		}
		if (input.customerId) {
			where["customerId"] = input.customerId;
		}
		if (input.stationId) {
			where["stationId"] = input.stationId;
		}
		if (input.employeeId) {
			where["assignments"] = {
				some: { employeeId: input.employeeId },
			};
		}
		if (input.search) {
			where["OR"] = [
				{ title: { contains: input.search, mode: "insensitive" } },
				{
					description: {
						contains: input.search,
						mode: "insensitive",
					},
				},
			];
		}

		const [tasks, total] = await Promise.all([
			db.task.findMany({
				where,
				select: {
					id: true,
					title: true,
					status: true,
					priority: true,
					category: true,
					dueDate: true,
					completedAt: true,
					createdAt: true,
					customer: {
						select: {
							id: true,
							fullName: true,
						},
					},
					station: {
						select: {
							id: true,
							name: true,
						},
					},
					assignments: {
						select: {
							employee: {
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
			db.task.count({ where }),
		]);

		return {
			tasks,
			total,
			page: input.page,
			pageSize: input.pageSize,
			totalPages: Math.ceil(total / input.pageSize),
		};
	});
