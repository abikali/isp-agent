"use client";

import { createInvalidatingMutation } from "@shared/hooks/create-invalidating-mutation";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useQuery } from "@tanstack/react-query";

/** Wallet balance + expense totals for the logged-in field employee. */
export function useMyWalletQuery() {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? orpc.billing.myWallet.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["billing", "myWallet"]),
	);

	return { wallet: query.data, isLoading: query.isLoading };
}

/** The logged-in worker's stock allocations. */
export function useMyStockQuery() {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? orpc.stock.myStock.queryOptions({ input: { organizationId } })
			: disabledQuery(["stock", "myStock"]),
	);

	return {
		allocations: query.data?.allocations ?? [],
		totalValue: query.data?.totalValue ?? 0,
		isLoading: query.isLoading,
	};
}

/** Open tasks assigned to the logged-in worker (scoped by tasks read:own). */
export function useMyTasksQuery() {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? orpc.tasks.list.queryOptions({
					input: {
						organizationId,
						sources: ["MANUAL", "LEGACY"],
						pageSize: 100,
					},
				})
			: disabledQuery(["tasks", "myList"]),
	);

	const open = (query.data?.tasks ?? []).filter(
		(t) =>
			t.status === "OPEN" ||
			t.status === "IN_PROGRESS" ||
			t.status === "ON_HOLD",
	);

	return {
		tasks: open,
		isLoading: query.isLoading,
		refetch: query.refetch,
	};
}

/** The logged-in worker's expenses. */
export function useMyExpensesQuery() {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? orpc.expenses.list.queryOptions({
					input: { organizationId, pageSize: 50 },
				})
			: disabledQuery(["expenses", "my"]),
	);

	return {
		expenses: query.data?.expenses ?? [],
		isLoading: query.isLoading,
	};
}

/** My pending installations (scoped by installations read:own). */
export function useMyInstallationsQuery() {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? orpc.installations.list.queryOptions({
					input: { organizationId, pageSize: 50 },
				})
			: disabledQuery(["installations", "my"]),
	);

	return {
		installations: query.data?.installations ?? [],
		isLoading: query.isLoading,
	};
}

/** Customers assigned to the logged-in worker (legacy worker.php lists). */
export function useMyCustomersQuery() {
	const organizationId = useOrganizationId();

	const meQuery = useQuery(
		organizationId
			? orpc.employees.me.queryOptions({ input: { organizationId } })
			: disabledQuery(["employees", "me"]),
	);
	const employeeId = meQuery.data?.employee?.id;

	const query = useQuery(
		organizationId && employeeId
			? orpc.customers.list.queryOptions({
					input: {
						organizationId,
						workerId: employeeId,
						pageSize: 100,
					},
				})
			: disabledQuery(["customers", "myWorkerCustomers"]),
	);

	return {
		customers: query.data?.customers ?? [],
		isLoading: meQuery.isLoading || query.isLoading,
	};
}

export const useWorkerCreateCustomer = createInvalidatingMutation(
	() => orpc.customers.workerCreate.mutationOptions(),
	() => [orpc.customers.key(), orpc.installations.key()],
);
