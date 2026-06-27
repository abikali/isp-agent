import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { getUserEmployeeId } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { fetchCollectorBalance } from "../lib/queries";
import { getMonthDateRange, resolveYearMonth } from "../lib/resolve-month";

/**
 * Worker-scoped wallet: cash balance + expense totals + recent ledger.
 *
 * Requires only org membership (field techs typically lack `billing view`);
 * data is strictly scoped to the caller's own employee record.
 */
export const getMyWallet = protectedProcedure
	.route({
		method: "GET",
		path: "/billing/my-wallet",
		tags: ["Billing"],
		summary: "Get the current employee's cash wallet",
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

		// Expense totals are scoped to the active billing month so the worker
		// portal shows only the current month's pending/approved expenses.
		const { year, month } = await resolveYearMonth(input.organizationId);
		const monthRange = getMonthDateRange(year, month);

		const [balance, pendingExpenses, approvedExpenses, recentEntries] =
			await Promise.all([
				fetchCollectorBalance(input.organizationId, employeeId),
				db.expense.aggregate({
					where: {
						organizationId: input.organizationId,
						submittedById: employeeId,
						status: "PENDING",
						createdAt: { gte: monthRange.gte, lte: monthRange.lte },
					},
					_count: true,
					_sum: { amount: true },
				}),
				db.expense.aggregate({
					where: {
						organizationId: input.organizationId,
						submittedById: employeeId,
						status: "APPROVED",
						createdAt: { gte: monthRange.gte, lte: monthRange.lte },
					},
					_count: true,
					_sum: { amount: true },
				}),
				db.cashCollection.findMany({
					where: {
						organizationId: input.organizationId,
						collectorId: employeeId,
					},
					select: {
						id: true,
						amount: true,
						type: true,
						notes: true,
						collectedAt: true,
					},
					orderBy: { collectedAt: "desc" },
					take: 15,
				}),
			]);

		return {
			employeeId,
			balance: balance.balance,
			totalCollected: balance.totalCollected,
			totalHandedOff: balance.totalHandedOff,
			pendingExpensesCount: pendingExpenses._count,
			pendingExpensesAmount: pendingExpenses._sum.amount ?? 0,
			approvedExpensesCount: approvedExpenses._count,
			approvedExpensesAmount: approvedExpenses._sum.amount ?? 0,
			recentEntries,
		};
	});
