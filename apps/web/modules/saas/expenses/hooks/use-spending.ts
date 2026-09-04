"use client";

import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";

/** The overview is the page; nothing renders without it → Suspense. */
export function useSpendingOverview() {
	const organizationId = useOrganizationId();
	if (!organizationId) {
		throw new Error("Organization not loaded");
	}
	return useSuspenseQuery(
		orpc.expenses.overview.queryOptions({ input: { organizationId } }),
	).data;
}

export type SpendingOverview = ReturnType<typeof useSpendingOverview>;
export type SpendingBucketRow = SpendingOverview["buckets"][number];
export type RecurringLine = SpendingOverview["recurring"][number];
export type AttentionClaim =
	SpendingOverview["attention"]["staleClaims"][number];

export function useSpendingBucket(bucketId: string) {
	const organizationId = useOrganizationId();
	if (!organizationId) {
		throw new Error("Organization not loaded");
	}
	return useSuspenseQuery(
		orpc.expenses.bucket.queryOptions({
			input: { organizationId, bucketId },
		}),
	).data;
}

export type SpendingBucket = ReturnType<typeof useSpendingBucket>;

/** The org's money-map buckets, for pickers. */
export function useFinanceCategories() {
	const organizationId = useOrganizationId();
	const query = useQuery(
		organizationId
			? orpc.finance.categories.list.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["finance", "categories", "list"]),
	);
	return {
		categories: query.data?.categories ?? [],
		isLoading: query.isLoading,
	};
}

function useInvalidateSpending() {
	const queryClient = useQueryClient();
	return () => {
		queryClient.invalidateQueries({ queryKey: orpc.expenses.key() });
		queryClient.invalidateQueries({ queryKey: orpc.finance.key() });
	};
}

export function useRecordExpense() {
	const invalidate = useInvalidateSpending();
	return useMutation({
		...orpc.expenses.record.mutationOptions(),
		onSuccess: invalidate,
	});
}

export function useSetExpenseBucket() {
	const invalidate = useInvalidateSpending();
	return useMutation({
		...orpc.expenses.setBucket.mutationOptions(),
		onSuccess: invalidate,
	});
}

export function useCreateRecurringExpense() {
	const invalidate = useInvalidateSpending();
	return useMutation({
		...orpc.expenses.recurring.create.mutationOptions(),
		onSuccess: invalidate,
	});
}

export function useUpdateRecurringExpense() {
	const invalidate = useInvalidateSpending();
	return useMutation({
		...orpc.expenses.recurring.update.mutationOptions(),
		onSuccess: invalidate,
	});
}

export function useDeleteRecurringExpense() {
	const invalidate = useInvalidateSpending();
	return useMutation({
		...orpc.expenses.recurring.delete.mutationOptions(),
		onSuccess: invalidate,
	});
}
