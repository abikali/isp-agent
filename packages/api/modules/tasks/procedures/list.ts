import {
	getActionScope,
	getUserEmployeeId,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { taskDealerScopeWhere } from "../lib/dealer-scope";

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
				.enum(["OPEN", "PENDING_APPROVAL", "COMPLETED", "CANCELLED"])
				.optional(),
			statuses: z
				.array(
					z.enum([
						"OPEN",
						"PENDING_APPROVAL",
						"COMPLETED",
						"CANCELLED",
					]),
				)
				.optional(),
			priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
			category: z
				.enum([
					"INSTALLATION",
					"MAINTENANCE",
					"REPLACEMENT",
					"REPAIR",
					"SUPPORT",
					"BILLING",
					"GENERAL",
					"UNINSTALL",
				])
				.optional(),
			source: z
				.enum(["MANUAL", "AI_ESCALATION", "LEGACY", "SYSTEM"])
				.optional(),
			sources: z
				.array(z.enum(["MANUAL", "AI_ESCALATION", "LEGACY", "SYSTEM"]))
				.optional(),
			followUpStatus: z
				.enum([
					"pending",
					"contacted",
					"promised",
					"resolved",
					"escalated",
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
		const { permCtx, activeDealerId } = await requirePermission(
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
		const andClauses: Record<string, unknown>[] = [];
		if (scope === "own") {
			const empId = await getUserEmployeeId(
				input.organizationId,
				user.id,
			);
			andClauses.push({
				OR: [
					{ createdById: user.id },
					...(empId
						? [{ assignments: { some: { employeeId: empId } } }]
						: []),
				],
			});
		}

		andClauses.push(taskDealerScopeWhere(activeDealerId));

		if (andClauses.length > 0) {
			where["AND"] = andClauses;
		}

		if (input.statuses && input.statuses.length > 0) {
			where["status"] = { in: input.statuses };
		} else if (input.status) {
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
		if (input.sources) {
			where["source"] = { in: input.sources };
		} else if (input.source) {
			where["source"] = input.source;
		}
		if (input.followUpStatus) {
			where["followUpStatus"] = input.followUpStatus;
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
					updatedAt: true,
					notes: true,
					followUpStatus: true,
					requestedAddons: true,
					resolutionCode: true,
					resolutionNote: true,
					completionPhotoUrl: true,
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
							accountNumber: true,
							mobile: true,
							phone: true,
							// Full list so the field card can offer every
							// number to call / WhatsApp, not just the primary.
							phones: true,
							address: true,
							// Drives the worker card's Directions link.
							latitude: true,
							longitude: true,
						},
					},
					station: {
						select: {
							id: true,
							name: true,
						},
					},
					base: {
						select: {
							id: true,
							name: true,
							address: true,
						},
					},
					conversation: {
						select: {
							id: true,
							contactName: true,
							agent: {
								select: {
									id: true,
									name: true,
								},
							},
						},
					},
					assignments: {
						select: {
							assignedAt: true,
							employee: {
								select: {
									id: true,
									name: true,
									position: true,
								},
							},
						},
					},
					completedByEmployee: {
						select: {
							id: true,
							name: true,
						},
					},
					installations: {
						select: {
							id: true,
							quantity: true,
							status: true,
							notes: true,
							stockItem: {
								select: {
									name: true,
								},
							},
						},
					},
					uninstalledItems: {
						select: {
							id: true,
							itemName: true,
							quantity: true,
							status: true,
						},
						orderBy: { uninstalledAt: "desc" },
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
