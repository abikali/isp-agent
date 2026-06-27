import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	getDealerScopeViaCustomer,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { fetchCollectorBalance } from "../../billing/lib/queries";
import { taskDealerScopeWhere } from "../../tasks/lib/dealer-scope";

/**
 * Consolidated analytics report for a single worker/employee.
 *
 * Unlike `employees.get` (which feeds the editable detail page with raw recent
 * lists), this endpoint returns aggregates ready for display: cash balance,
 * expense breakdown by status, field-work activity counts, current stock
 * value, a month-by-month trend, and a compact recent-activity feed. The
 * `months` window scopes the trend chart and the "period" totals; all-time
 * cash balance is always returned.
 *
 * Numbers are kept consistent with the rest of the app by reusing the shared
 * `fetchCollectorBalance` helper and the same dealer-scope filters used by
 * `employees.get`, `tasks.workload`, and the billing procedures.
 */
export const getEmployeeReport = protectedProcedure
	.route({
		method: "GET",
		path: "/employees/{id}/report",
		tags: ["Employees"],
		summary: "Consolidated analytics report for a single worker",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
			months: z
				.union([z.literal(3), z.literal(6), z.literal(12)])
				.default(6),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"employees",
			"read",
		);

		const dealerFilter = getDealerScopeFilter(activeDealerId);
		const dealerViaCustomer = getDealerScopeViaCustomer(activeDealerId);

		const employee = await db.employee.findFirst({
			where: {
				id: input.id,
				organizationId: input.organizationId,
				...dealerFilter,
			},
			select: {
				id: true,
				name: true,
				employeeNumber: true,
				status: true,
				position: true,
				department: true,
				preferredLayout: true,
				phone: true,
				hireDate: true,
				userId: true,
				externalId: true,
				dealer: { select: { id: true, name: true } },
				workerStock: {
					select: {
						id: true,
						quantity: true,
						unitPrice: true,
						stockItem: { select: { id: true, name: true } },
					},
				},
			},
		});

		if (!employee) {
			throw new ORPCError("NOT_FOUND", { message: "Employee not found" });
		}

		// ── Window boundaries (Beirut-agnostic: trend buckets use UTC months) ──
		const now = new Date();
		const windowStart = new Date(
			Date.UTC(
				now.getUTCFullYear(),
				now.getUTCMonth() - (input.months - 1),
				1,
			),
		);
		const startOfMonth = new Date(
			Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
		);

		const [
			balance,
			expenseByStatus,
			customersCollecting,
			customersWorker,
			stationsCount,
			openTasks,
			completedThisMonth,
			installationsAll,
			stockDelivered,
			stockReturned,
			recoveryPending,
			windowPayments,
			windowHandoffs,
			windowExpenses,
			windowInstallations,
		] = await Promise.all([
			fetchCollectorBalance(input.organizationId, employee.id),
			db.expense.groupBy({
				by: ["status"],
				where: {
					organizationId: input.organizationId,
					submittedById: employee.id,
				},
				_count: true,
				_sum: { amount: true },
			}),
			db.customer.count({
				where: {
					organizationId: input.organizationId,
					collectorId: employee.id,
					...dealerFilter,
				},
			}),
			db.customer.count({
				where: {
					organizationId: input.organizationId,
					workerId: employee.id,
					...dealerFilter,
				},
			}),
			db.employeeStation.count({ where: { employeeId: employee.id } }),
			db.taskAssignment.count({
				where: {
					employeeId: employee.id,
					task: {
						organizationId: input.organizationId,
						status: { in: ["OPEN", "IN_PROGRESS", "ON_HOLD"] },
						...taskDealerScopeWhere(activeDealerId),
					},
				},
			}),
			db.task.count({
				where: {
					organizationId: input.organizationId,
					status: "COMPLETED",
					completedByEmployeeId: employee.id,
					completedAt: { gte: startOfMonth },
				},
			}),
			db.installation.aggregate({
				where: {
					organizationId: input.organizationId,
					employeeId: employee.id,
					...dealerViaCustomer,
				},
				_count: true,
				_sum: { price: true },
			}),
			// Stock delivered to the worker within the window (custody he took on).
			db.stockLog.aggregate({
				where: {
					organizationId: input.organizationId,
					employeeId: employee.id,
					action: "TRANSFER_TO_WORKER",
					createdAt: { gte: windowStart },
				},
				_sum: { quantity: true },
			}),
			// Stock returned by the worker within the window (custody he gave back).
			db.stockLog.aggregate({
				where: {
					organizationId: input.organizationId,
					employeeId: employee.id,
					action: "TRANSFER_FROM_WORKER",
					createdAt: { gte: windowStart },
				},
				_sum: { quantity: true },
			}),
			// Recovered/uninstalled gear awaiting review (credits back to his stock).
			db.uninstalledItem.aggregate({
				where: {
					organizationId: input.organizationId,
					employeeId: employee.id,
					status: "PENDING",
				},
				_count: true,
				_sum: { quantity: true },
			}),
			db.payment.findMany({
				where: {
					organizationId: input.organizationId,
					collectorId: employee.id,
					status: "COLLECTED",
					workerId: null,
					paidAt: { gte: windowStart },
				},
				select: {
					id: true,
					paidAmount: true,
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
				take: 500,
			}),
			db.cashCollection.findMany({
				where: {
					organizationId: input.organizationId,
					collectorId: employee.id,
					collectedAt: { gte: windowStart },
				},
				select: {
					id: true,
					amount: true,
					type: true,
					notes: true,
					collectedAt: true,
				},
				orderBy: { collectedAt: "desc" },
				take: 200,
			}),
			db.expense.findMany({
				where: {
					organizationId: input.organizationId,
					submittedById: employee.id,
					createdAt: { gte: windowStart },
				},
				select: {
					id: true,
					amount: true,
					description: true,
					status: true,
					createdAt: true,
				},
				orderBy: { createdAt: "desc" },
				take: 200,
			}),
			db.installation.findMany({
				where: {
					organizationId: input.organizationId,
					employeeId: employee.id,
					...dealerViaCustomer,
					installedAt: { gte: windowStart },
				},
				select: {
					id: true,
					price: true,
					quantity: true,
					status: true,
					installedAt: true,
					customer: {
						select: {
							id: true,
							firstName: true,
							lastName: true,
							accountNumber: true,
						},
					},
					stockItem: { select: { id: true, name: true } },
				},
				orderBy: { installedAt: "desc" },
				take: 200,
			}),
		]);

		// ── Expense breakdown by status ───────────────────────────────────
		const expenseBucket = (status: "PENDING" | "APPROVED" | "REJECTED") => {
			const row = expenseByStatus.find((e) => e.status === status);
			return { count: row?._count ?? 0, amount: row?._sum.amount ?? 0 };
		};
		const expensePending = expenseBucket("PENDING");
		const expenseApproved = expenseBucket("APPROVED");
		const expenseRejected = expenseBucket("REJECTED");

		// ── Stock value ───────────────────────────────────────────────────
		const stockAllocations = employee.workerStock
			.map((s) => ({
				id: s.id,
				name: s.stockItem.name,
				quantity: s.quantity,
				unitPrice: s.unitPrice,
				total: s.quantity * s.unitPrice,
			}))
			.sort((a, b) => b.total - a.total);
		const stockValue = stockAllocations.reduce(
			(sum, s) => sum + s.total,
			0,
		);
		const stockUnits = stockAllocations.reduce(
			(sum, s) => sum + s.quantity,
			0,
		);

		// ── Month-by-month trend (zero-filled across the window) ───────────
		const monthKey = (d: Date) =>
			`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

		const trendMap = new Map<
			string,
			{
				month: string;
				label: string;
				collected: number;
				handedOff: number;
				expenses: number;
				installations: number;
			}
		>();
		for (let i = 0; i < input.months; i++) {
			const d = new Date(
				Date.UTC(
					windowStart.getUTCFullYear(),
					windowStart.getUTCMonth() + i,
					1,
				),
			);
			trendMap.set(monthKey(d), {
				month: monthKey(d),
				label: d.toLocaleDateString("en-US", {
					month: "short",
					timeZone: "UTC",
				}),
				collected: 0,
				handedOff: 0,
				expenses: 0,
				installations: 0,
			});
		}
		for (const p of windowPayments) {
			const b = trendMap.get(monthKey(p.paidAt));
			if (b) {
				b.collected += p.paidAmount;
			}
		}
		for (const c of windowHandoffs) {
			const b = trendMap.get(monthKey(c.collectedAt));
			if (b) {
				b.handedOff += c.amount;
			}
		}
		for (const e of windowExpenses) {
			const b = trendMap.get(monthKey(e.createdAt));
			if (b) {
				b.expenses += e.amount;
			}
		}
		for (const inst of windowInstallations) {
			const b = trendMap.get(monthKey(inst.installedAt));
			if (b) {
				b.installations += 1;
			}
		}
		const trend = [...trendMap.values()];

		// ── Period totals (within the selected window) ────────────────────
		const periodCollected = windowPayments.reduce(
			(sum, p) => sum + p.paidAmount,
			0,
		);
		const periodHandedOff = windowHandoffs.reduce(
			(sum, c) => sum + c.amount,
			0,
		);
		const periodExpenses = windowExpenses.reduce(
			(sum, e) => sum + e.amount,
			0,
		);

		// ── Worker settlement ─────────────────────────────────────────────
		// What the worker owes the office, and what the office owes back:
		//   • cashInHand  — collected cash not yet handed off. Approved expenses
		//     are already netted out (each writes an EXPENSE_DEDUCTION cash row),
		//     so this is the live cash debt. Positive ⇒ worker holds office cash.
		//   • stockValue  — sell-price value of inventory in his custody. Until
		//     installed or returned he is accountable for it.
		//   • pendingReimbursements — expenses he fronted that aren't approved
		//     yet; once approved they reduce his cash debt. The office owes these.
		// Net = cash + stock − pendingReimbursements. Positive ⇒ worker owes
		// office; negative ⇒ office owes worker.
		const cashInHand = balance.balance;
		const pendingReimbursements = expensePending.amount;
		const netOwedByWorker = cashInHand + stockValue - pendingReimbursements;

		const installedUnits = windowInstallations.reduce(
			(sum, inst) => sum + inst.quantity,
			0,
		);

		return {
			employee: {
				id: employee.id,
				name: employee.name,
				employeeNumber: employee.employeeNumber,
				status: employee.status,
				position: employee.position,
				department: employee.department,
				preferredLayout: employee.preferredLayout,
				phone: employee.phone,
				hireDate: employee.hireDate,
				hasLogin: employee.userId != null,
				dealer: employee.dealer,
			},
			months: input.months,
			financial: {
				totalCollected: balance.totalCollected,
				totalHandedOff: balance.totalHandedOff,
				balance: balance.balance,
				expensePending,
				expenseApproved,
				expenseRejected,
			},
			period: {
				collected: periodCollected,
				handedOff: periodHandedOff,
				expenses: periodExpenses,
				payments: windowPayments.length,
				installations: windowInstallations.length,
			},
			activity: {
				customersCollecting,
				customersWorker,
				stations: stationsCount,
				openTasks,
				completedThisMonth,
				installationsCount: installationsAll._count,
				installationsValue: installationsAll._sum.price ?? 0,
			},
			stock: {
				value: stockValue,
				units: stockUnits,
				itemCount: stockAllocations.length,
				allocations: stockAllocations,
			},
			settlement: {
				cashInHand,
				stockValue,
				pendingReimbursements,
				netOwedByWorker,
			},
			stockFlow: {
				deliveredUnits: stockDelivered._sum.quantity ?? 0,
				returnedUnits: stockReturned._sum.quantity ?? 0,
				installedUnits,
				recoveryPendingCount: recoveryPending._count,
				recoveryPendingUnits: recoveryPending._sum.quantity ?? 0,
			},
			trend,
			recent: {
				payments: windowPayments.slice(0, 8),
				cashCollections: windowHandoffs.slice(0, 8),
				expenses: windowExpenses.slice(0, 8),
				installations: windowInstallations.slice(0, 8),
			},
		};
	});
