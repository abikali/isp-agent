import { ORPCError } from "@orpc/server";
import {
	requirePermission,
	verifyTaskOwnership,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { taskDealerScopeWhere } from "../lib/dealer-scope";

export const getTask = protectedProcedure
	.route({
		method: "GET",
		path: "/tasks/{id}",
		tags: ["Tasks"],
		summary: "Get a single task with assignments and linked entities",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { permCtx, activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"tasks",
			"read",
		);

		const task = await db.task.findFirst({
			where: {
				id: input.id,
				organizationId: input.organizationId,
				...taskDealerScopeWhere(activeDealerId),
			},
			include: {
				createdBy: {
					select: {
						id: true,
						name: true,
						email: true,
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
						messages: {
							select: {
								id: true,
								role: true,
								content: true,
								createdAt: true,
							},
							orderBy: { createdAt: "desc" },
							take: 5,
						},
					},
				},
				customer: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						accountNumber: true,
						email: true,
						phone: true,
						address: true,
						status: true,
						connectionType: true,
						monthlyRate: true,
						plan: {
							select: {
								id: true,
								name: true,
							},
						},
						station: {
							select: {
								id: true,
								name: true,
							},
						},
					},
				},
				station: {
					select: {
						id: true,
						name: true,
						address: true,
					},
				},
				base: {
					select: {
						id: true,
						name: true,
						address: true,
					},
				},
				assignments: {
					select: {
						assignedAt: true,
						employee: {
							select: {
								id: true,
								name: true,
								employeeNumber: true,
								position: true,
							},
						},
					},
				},
				completedByEmployee: {
					select: { id: true, name: true },
				},
				uninstalledItems: {
					select: {
						id: true,
						itemName: true,
						quantity: true,
						pictureUrl: true,
						status: true,
						uninstalledAt: true,
					},
					orderBy: { uninstalledAt: "desc" },
				},
			},
		});

		if (!task) {
			throw new ORPCError("NOT_FOUND", {
				message: "Task not found",
			});
		}

		await verifyTaskOwnership(permCtx, "read", task);

		return { task };
	});
