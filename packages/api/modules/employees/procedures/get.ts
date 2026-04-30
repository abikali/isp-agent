import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	getDealerScopeViaCustomer,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { taskDealerScopeWhere } from "../../tasks/lib/dealer-scope";

export const getEmployee = protectedProcedure
	.route({
		method: "GET",
		path: "/employees/{id}",
		tags: ["Employees"],
		summary: "Get a single employee with stations and recent tasks",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"employees",
			"read",
		);

		// Cross-dealer assignments can exist for employees reassigned across
		// dealers; the scoped includes hide rows that pre-date the current
		// active dealer.
		const dealerFilter = getDealerScopeFilter(activeDealerId);
		const dealerViaCustomer = getDealerScopeViaCustomer(activeDealerId);

		const employee = await db.employee.findFirst({
			where: {
				id: input.id,
				organizationId: input.organizationId,
				...dealerFilter,
			},
			include: {
				dealer: { select: { id: true, name: true } },
				stations: {
					select: {
						assignedAt: true,
						station: {
							select: {
								id: true,
								name: true,
								address: true,
								status: true,
							},
						},
					},
				},
				taskAssignments: {
					where: { task: taskDealerScopeWhere(activeDealerId) },
					select: {
						assignedAt: true,
						task: {
							select: {
								id: true,
								title: true,
								status: true,
								priority: true,
								category: true,
								source: true,
								dueDate: true,
							},
						},
					},
					orderBy: { assignedAt: "desc" },
					take: 20,
				},
				customerCollections: {
					where: dealerFilter,
					select: {
						id: true,
						accountNumber: true,
						firstName: true,
						lastName: true,
						status: true,
						monthlyRate: true,
					},
					orderBy: { firstName: "asc" },
					take: 100,
				},
				customerWorkerAssignments: {
					where: dealerFilter,
					select: {
						id: true,
						accountNumber: true,
						firstName: true,
						lastName: true,
						status: true,
					},
					orderBy: { firstName: "asc" },
					take: 100,
				},
				paymentsCollected: {
					where: dealerViaCustomer,
					select: {
						id: true,
						paidAmount: true,
						accountPrice: true,
						discount: true,
						status: true,
						paidAt: true,
						customer: {
							select: {
								id: true,
								firstName: true,
								lastName: true,
								accountNumber: true,
							},
						},
					},
					orderBy: { paidAt: "desc" },
					take: 50,
				},
				cashCollections: {
					select: {
						id: true,
						amount: true,
						type: true,
						notes: true,
						collectedAt: true,
					},
					orderBy: { collectedAt: "desc" },
					take: 20,
				},
				expensesSubmitted: {
					select: {
						id: true,
						amount: true,
						description: true,
						status: true,
						createdAt: true,
					},
					orderBy: { createdAt: "desc" },
					take: 20,
				},
				installationsDone: {
					where: dealerViaCustomer,
					select: {
						id: true,
						status: true,
						price: true,
						quantity: true,
						notes: true,
						installedAt: true,
						customer: {
							select: {
								id: true,
								firstName: true,
								lastName: true,
								accountNumber: true,
							},
						},
						stockItem: {
							select: { id: true, name: true },
						},
					},
					orderBy: { installedAt: "desc" },
					take: 20,
				},
				workerStock: {
					select: {
						id: true,
						quantity: true,
						unitPrice: true,
						stockItem: {
							select: { id: true, name: true },
						},
					},
				},
			},
		});

		if (!employee) {
			throw new ORPCError("NOT_FOUND", {
				message: "Employee not found",
			});
		}

		return { employee };
	});
