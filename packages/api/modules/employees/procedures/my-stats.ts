import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { getUserEmployeeId } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

/**
 * Current-month activity stats for the logged-in field employee.
 *
 * Mirrors `billing.myWallet`'s auth model: requires only org membership
 * (field techs lack `employees view`) and is strictly scoped to the caller's
 * own employee record. Powers the per-tab stat strips in the worker portal.
 *
 * "This month" = current calendar month in UTC (the server timezone), which is
 * the worker's intuitive reading regardless of the billing-month lock state.
 */
export const getMyWorkerStats = protectedProcedure
	.route({
		method: "GET",
		path: "/employees/my-stats",
		tags: ["Employees"],
		summary: "Current-month activity stats for the current employee",
	})
	.input(z.object({ organizationId: z.string() }))
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

		const employeeId = await getUserEmployeeId(
			input.organizationId,
			user.id,
		);
		if (!employeeId) {
			throw new ORPCError("FORBIDDEN", {
				message: "No employee record linked to your account",
			});
		}

		const now = new Date();
		const monthStart = new Date(
			Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
		);
		const monthEnd = new Date(
			Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
		);
		const monthRange = { gte: monthStart, lt: monthEnd };
		const org = input.organizationId;

		const [
			openTasks,
			completedTasks,
			installAgg,
			customersCreated,
			customersPending,
			stockReceived,
			expenseByStatus,
		] = await Promise.all([
			db.task.count({
				where: {
					organizationId: org,
					source: { in: ["MANUAL", "LEGACY"] },
					status: { in: ["OPEN", "IN_PROGRESS", "ON_HOLD"] },
					assignments: { some: { employeeId } },
				},
			}),
			db.task.count({
				where: {
					organizationId: org,
					status: "COMPLETED",
					completedAt: monthRange,
					assignments: { some: { employeeId } },
				},
			}),
			db.installation.aggregate({
				where: {
					organizationId: org,
					employeeId,
					status: { not: "DENIED" },
					installedAt: monthRange,
				},
				_count: true,
				_sum: { price: true },
			}),
			db.customerSetupRequest.count({
				where: {
					organizationId: org,
					requestedById: employeeId,
					createdAt: monthRange,
				},
			}),
			db.customerSetupRequest.count({
				where: {
					organizationId: org,
					requestedById: employeeId,
					status: "PENDING",
				},
			}),
			db.stockLog.aggregate({
				where: {
					organizationId: org,
					employeeId,
					action: "TRANSFER_TO_WORKER",
					createdAt: monthRange,
				},
				_sum: { quantity: true },
			}),
			db.expense.groupBy({
				by: ["status"],
				where: {
					organizationId: org,
					submittedById: employeeId,
					createdAt: monthRange,
				},
				_count: true,
				_sum: { amount: true },
			}),
		]);

		function expenseBucket(status: "PENDING" | "APPROVED" | "REJECTED") {
			const row = expenseByStatus.find((r) => r.status === status);
			return {
				count: row?._count ?? 0,
				amount: row?._sum.amount ?? 0,
			};
		}

		return {
			tasks: {
				open: openTasks,
				completedThisMonth: completedTasks,
			},
			installations: {
				completedThisMonth: installAgg._count,
				valueThisMonth: installAgg._sum.price ?? 0,
			},
			customers: {
				createdThisMonth: customersCreated,
				pendingApproval: customersPending,
			},
			stock: {
				receivedThisMonth: stockReceived._sum.quantity ?? 0,
			},
			expenses: {
				pending: expenseBucket("PENDING"),
				approved: expenseBucket("APPROVED"),
				rejected: expenseBucket("REJECTED"),
			},
		};
	});
