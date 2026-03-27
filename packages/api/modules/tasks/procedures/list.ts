import {
	getActionScope,
	getUserEmployeeId,
	requirePermission,
} from "@repo/api/lib/permission";
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
			source: z.enum(["MANUAL", "AI_ESCALATION"]).optional(),
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
		const { permCtx } = await requirePermission(
			input.organizationId,
			user.id,
			"tasks",
			"read",
		);

		const where: Record<string, unknown> = {
			organizationId: input.organizationId,
		};

		// Composite own filter: tasks created by user OR assigned to user's employee
		// Uses AND to avoid conflicting with the search OR clause
		const scope = getActionScope(permCtx, "tasks", "read");
		if (scope === "own") {
			const empId = await getUserEmployeeId(
				input.organizationId,
				user.id,
			);
			where["AND"] = [
				{
					OR: [
						{ createdById: user.id },
						...(empId
							? [{ assignments: { some: { employeeId: empId } } }]
							: []),
					],
				},
			];
		}

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
		if (input.source) {
			where["source"] = input.source;
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
					description: true,
					status: true,
					priority: true,
					category: true,
					source: true,
					dueDate: true,
					completedAt: true,
					createdAt: true,
					notes: true,
					createdBy: {
						select: {
							id: true,
							name: true,
						},
					},
					customer: {
						select: {
							id: true,
							firstName: true,
							lastName: true,
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
