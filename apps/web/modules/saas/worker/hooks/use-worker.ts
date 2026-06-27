"use client";

import { createInvalidatingMutation } from "@shared/hooks/create-invalidating-mutation";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useQuery } from "@tanstack/react-query";

/** Plans, collectors, and groups for the field new-customer form. */
export function useWorkerCreateOptions() {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? orpc.customers.workerCreateOptions.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["customers", "workerCreateOptions"]),
	);

	return {
		plans: query.data?.plans ?? [],
		collectors: query.data?.collectors ?? [],
		groups: query.data?.groups ?? [],
		isLoading: query.isLoading,
	};
}

/** Current-month activity stats for the logged-in field employee. */
export function useMyStatsQuery() {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? orpc.employees.myStats.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["employees", "myStats"]),
	);

	return { stats: query.data, isLoading: query.isLoading };
}

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

export type TaskStatusValue =
	| "OPEN"
	| "IN_PROGRESS"
	| "ON_HOLD"
	| "COMPLETED"
	| "CANCELLED";

export type TaskCategoryValue =
	| "INSTALLATION"
	| "MAINTENANCE"
	| "REPLACEMENT"
	| "REPAIR"
	| "SUPPORT"
	| "BILLING"
	| "GENERAL"
	| "UNINSTALL";

export interface MyTasksParams {
	search?: string;
	statuses?: TaskStatusValue[];
	category?: TaskCategoryValue;
	sortBy?: "createdAt" | "title" | "priority" | "status" | "dueDate";
	sortOrder?: "asc" | "desc";
	page?: number;
	pageSize?: number;
}

/**
 * Tasks assigned to the logged-in worker (scoped by `tasks read:own`), with
 * server-side search / status / category filtering, sorting and pagination.
 */
export function useMyTasksList(params: MyTasksParams = {}) {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? orpc.tasks.list.queryOptions({
					input: {
						organizationId,
						sources: ["MANUAL", "LEGACY"],
						page: params.page ?? 1,
						pageSize: params.pageSize ?? 15,
						sortBy: params.sortBy ?? "createdAt",
						sortOrder: params.sortOrder ?? "desc",
						...(params.search ? { search: params.search } : {}),
						...(params.statuses
							? { statuses: params.statuses }
							: {}),
						...(params.category
							? { category: params.category }
							: {}),
					},
				})
			: disabledQuery(["tasks", "myList"]),
	);

	return {
		tasks: query.data?.tasks ?? [],
		total: query.data?.total ?? 0,
		totalPages: query.data?.totalPages ?? 0,
		page: query.data?.page ?? params.page ?? 1,
		isLoading: query.isLoading,
		isFetching: query.isFetching,
		refetch: query.refetch,
	};
}

export interface MyExpensesParams {
	search?: string;
	status?: "PENDING" | "APPROVED" | "REJECTED";
	sortBy?: "createdAt" | "amount" | "status";
	sortOrder?: "asc" | "desc";
	page?: number;
	pageSize?: number;
}

/**
 * The logged-in worker's expenses (scoped by `expenses read:own`), with
 * server-side search / status filtering, sorting and pagination.
 */
export function useMyExpensesList(params: MyExpensesParams = {}) {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? orpc.expenses.list.queryOptions({
					input: {
						organizationId,
						page: params.page ?? 1,
						pageSize: params.pageSize ?? 15,
						sortBy: params.sortBy ?? "createdAt",
						sortOrder: params.sortOrder ?? "desc",
						...(params.search ? { search: params.search } : {}),
						...(params.status ? { status: params.status } : {}),
					},
				})
			: disabledQuery(["expenses", "my"]),
	);

	return {
		expenses: query.data?.expenses ?? [],
		total: query.data?.total ?? 0,
		totalAmount: query.data?.totalAmount ?? 0,
		totalPages: query.data?.totalPages ?? 0,
		page: query.data?.page ?? params.page ?? 1,
		isLoading: query.isLoading,
		isFetching: query.isFetching,
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
	() => [
		orpc.customers.key(),
		orpc.installations.key(),
		orpc.employees.key(),
	],
);
