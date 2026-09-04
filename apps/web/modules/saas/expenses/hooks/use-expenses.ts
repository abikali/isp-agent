"use client";

import { createInvalidatingMutation } from "@shared/hooks/create-invalidating-mutation";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useMutation, useQuery } from "@tanstack/react-query";

export type ExpenseStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface ExpenseFilters {
	search?: string;
	status?: ExpenseStatus;
	employeeId?: string;
	category?: string;
	financeCategoryId?: string;
	hasReceipt?: boolean;
	source?: "claims" | "direct";
	from?: Date;
	to?: Date;
}

export type ExpenseSortBy =
	| "createdAt"
	| "amount"
	| "status"
	| "approvedAt"
	| "category";

export function useExpenses(
	filters: ExpenseFilters & {
		page?: number;
		pageSize?: number;
		sortBy?: ExpenseSortBy;
		sortOrder?: "asc" | "desc";
	},
) {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? orpc.expenses.list.queryOptions({
					input: { organizationId, ...filters },
				})
			: disabledQuery(["expenses", "list"]),
	);

	return {
		expenses: query.data?.expenses ?? [],
		total: query.data?.total ?? 0,
		isLoading: query.isLoading,
		isFetching: query.isFetching,
		error: query.error,
	};
}

/** Totals for the rows the current filters select — including later pages. */
export function useExpenseSummary(filters: ExpenseFilters) {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? orpc.expenses.summary.queryOptions({
					input: { organizationId, ...filters },
				})
			: disabledQuery(["expenses", "summary"]),
	);

	return { summary: query.data };
}

/** Workers / categories / buckets that actually appear in expense claims. */
export function useExpenseFilterOptions(status?: ExpenseStatus) {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? orpc.expenses.filterOptions.queryOptions({
					input: { organizationId, ...(status ? { status } : {}) },
				})
			: disabledQuery(["expenses", "filterOptions"]),
	);

	return {
		workers: query.data?.workers ?? [],
		categories: query.data?.categories ?? [],
		buckets: query.data?.buckets ?? [],
	};
}

export const useCreateExpense = createInvalidatingMutation(
	() => orpc.expenses.create.mutationOptions(),
	() => [orpc.expenses.key(), orpc.employees.key(), orpc.billing.key()],
);

export const useApproveExpense = createInvalidatingMutation(
	() => orpc.expenses.approve.mutationOptions(),
	() => [orpc.expenses.key(), orpc.billing.key()],
);

export const useRejectExpense = createInvalidatingMutation(
	() => orpc.expenses.reject.mutationOptions(),
	() => orpc.expenses.key(),
);

export function useCreateReceiptUploadUrl() {
	return useMutation(orpc.expenses.createReceiptUploadUrl.mutationOptions());
}
