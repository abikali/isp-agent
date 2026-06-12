"use client";

import { createInvalidatingMutation } from "@shared/hooks/create-invalidating-mutation";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useMutation, useQuery, useSuspenseQuery } from "@tanstack/react-query";

export type ExpenseStatus = "PENDING" | "APPROVED" | "REJECTED";

export function useExpenses(filters: {
	status?: ExpenseStatus;
	employeeId?: string;
	from?: Date;
	to?: Date;
	page?: number;
}) {
	const organizationId = useOrganizationId();

	const query = useSuspenseQuery(
		orpc.expenses.list.queryOptions({
			input: {
				organizationId: organizationId ?? "",
				...filters,
			},
		}),
	);

	return {
		expenses: query.data?.expenses ?? [],
		total: query.data?.total ?? 0,
		totalAmount: query.data?.totalAmount ?? 0,
		totalPages: query.data?.totalPages ?? 1,
	};
}

export function useExpenseStatsQuery() {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? orpc.expenses.stats.queryOptions({ input: { organizationId } })
			: disabledQuery(["expenses", "stats"]),
	);

	return { stats: query.data, isLoading: query.isLoading };
}

export const useCreateExpense = createInvalidatingMutation(
	() => orpc.expenses.create.mutationOptions(),
	() => orpc.expenses.key(),
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
