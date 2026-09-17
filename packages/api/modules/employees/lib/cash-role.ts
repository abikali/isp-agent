import type { Prisma } from "@repo/database";
import type { EmployeeCashRole } from "@repo/database/enums";

/**
 * Employee field role — collector, worker, or both.
 *
 * `Employee.cashRole` is the explicit setting (admin-edited on the employee
 * page). It is nullable until every employee has been backfilled, so every
 * reader falls back to the derivation that existed before the column did.
 *
 * Browser-safe: type-only imports, so the web app can share the labels and
 * the fallback rule.
 */

export const CASH_ROLES = ["COLLECTOR", "WORKER", "BOTH"] as const;

export const CASH_ROLE_LABELS: Record<EmployeeCashRole, string> = {
	COLLECTOR: "Collector",
	WORKER: "Worker",
	BOTH: "Collector & worker",
};

interface CashRoleFields {
	cashRole: EmployeeCashRole | null;
	department: string | null;
}

/**
 * The role an employee's cash is settled under. Unset roles fall back to the
 * Money page's historical rule: billing department → collector, anyone else
 * → worker.
 */
export function resolveCashRole(employee: CashRoleFields): EmployeeCashRole {
	if (employee.cashRole) {
		return employee.cashRole;
	}
	return employee.department === "BILLING" ? "COLLECTOR" : "WORKER";
}

/**
 * Whether the collector wallet formula (collected payments − ledger) applies.
 * WORKER uses −ledger only. BOTH collects on billing rounds, so his payments
 * must count.
 *
 * Known gap for BOTH: a setup approval writes the first subscription both as
 * a Payment (collectorId = requester) and inside the NEW_USER_SETUP ledger
 * row, so a BOTH employee who also files setup requests sees that
 * subscription twice until payments carry a setup-request link.
 */
export function usesCollectorWallet(role: EmployeeCashRole): boolean {
	return role !== "WORKER";
}

/**
 * Employees who act as collectors: explicit COLLECTOR/BOTH, or no role set
 * and in the billing department. Dealer-scoped by `dealerScope`.
 */
export function collectorRoleWhere(
	dealerScope: Record<string, unknown>,
): Prisma.EmployeeWhereInput {
	return {
		...dealerScope,
		OR: [
			{ cashRole: { in: ["COLLECTOR", "BOTH"] } },
			{ cashRole: null, department: "BILLING" },
		],
	};
}

/**
 * Employees who act as field workers: explicit WORKER/BOTH, or no role set
 * and surfaced to the worker portal (org `worker` member role or worker
 * layout). Not dealer-scoped — callers add their own scope.
 */
export function workerRoleWhere(
	organizationId: string,
): Prisma.EmployeeWhereInput {
	return {
		OR: [
			{ cashRole: { in: ["WORKER", "BOTH"] } },
			{
				cashRole: null,
				OR: [
					{
						user: {
							members: {
								some: { organizationId, role: "worker" },
							},
						},
					},
					{ preferredLayout: "worker" },
				],
			},
		],
	};
}
