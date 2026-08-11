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

/** Monthly activity trend for the Tasks chart (lazy: only fetched when shown). */
export function useMyTrendQuery(months: 3 | 6 | 12, enabled: boolean) {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? {
					...orpc.employees.myTrend.queryOptions({
						input: { organizationId, months },
					}),
					enabled,
				}
			: disabledQuery(["employees", "myTrend"]),
	);

	return {
		trend: query.data?.trend ?? [],
		isLoading: query.isLoading,
		isFetching: query.isFetching,
	};
}

/** Customers the logged-in field employee signed up or serviced this month. */
export function useMyMonthCustomersQuery() {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? orpc.employees.myMonthCustomers.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["employees", "myMonthCustomers"]),
	);

	return {
		customers: query.data?.customers ?? [],
		newCount: query.data?.newCount ?? 0,
		serviceCount: query.data?.serviceCount ?? 0,
		newTotal: query.data?.newTotal ?? 0,
		serviceTotal: query.data?.serviceTotal ?? 0,
		totalToCollect: query.data?.totalToCollect ?? 0,
		isLoading: query.isLoading,
	};
}

/** The logged-in user's own employee id, or undefined while it resolves. */
export function useMyEmployeeId() {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? orpc.employees.me.queryOptions({ input: { organizationId } })
			: disabledQuery(["employees", "me"]),
	);

	return query.data?.employee?.id;
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
		pendingRefundByItem: query.data?.pendingRefundByItem ?? {},
		isLoading: query.isLoading,
	};
}

/**
 * Admin-curated items flagged to show in the uninstall recovered-item dropdown.
 * Not scoped to the worker's own stock — recovered equipment is the customer's
 * old gear, not stock the worker carries.
 */
export function useUninstallItemsQuery() {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? orpc.stock.uninstallItems.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["stock", "uninstallItems"]),
	);

	return {
		items: query.data?.items ?? [],
		isLoading: query.isLoading,
	};
}

/** Request a refund (return) on stock the worker holds. */
export const useRequestStockRefund = createInvalidatingMutation(
	() => orpc.stock.requestRefund.mutationOptions(),
	() => [orpc.stock.key()],
);

export type TaskStatusValue =
	| "OPEN"
	| "PENDING_APPROVAL"
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
	from?: Date;
	to?: Date;
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
						...(params.from ? { from: params.from } : {}),
						...(params.to ? { to: params.to } : {}),
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

export const useWorkerCreateCustomer = createInvalidatingMutation(
	() => orpc.customers.workerCreate.mutationOptions(),
	() => [
		orpc.customers.key(),
		orpc.installations.key(),
		orpc.employees.key(),
	],
);
