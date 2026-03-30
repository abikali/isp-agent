import { ORPCError } from "@orpc/server";
import {
	requirePermission,
	verifyTaskOwnership,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

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
		const [{ permCtx, activeDealerId }, task] = await Promise.all([
			requirePermission(input.organizationId, user.id, "tasks", "read"),
			db.task.findFirst({
				where: {
					id: input.id,
					organizationId: input.organizationId,
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
							dealerId: true,
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
				},
			}),
		]);

		if (!task) {
			throw new ORPCError("NOT_FOUND", {
				message: "Task not found",
			});
		}

		await verifyTaskOwnership(permCtx, "read", task);

		// Dealer scoping: if task has a customer, it must belong to the active dealer
		if (
			task.customerId &&
			task.customer?.dealerId !== (activeDealerId ?? null)
		) {
			throw new ORPCError("NOT_FOUND", {
				message: "Task not found",
			});
		}

		return { task };
	});
