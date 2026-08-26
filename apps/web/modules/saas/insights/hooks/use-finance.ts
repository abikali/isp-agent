"use client";

import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";

export type FinancePeriod = "this-month" | "last-month" | "last-3" | "last-12";

/** The four headline numbers. Suspense — this is the page's reason to exist,
 *  so there is nothing meaningful to render without it. */
export function useFinanceSummary(period: FinancePeriod) {
	const organizationId = useOrganizationId();
	if (!organizationId) {
		throw new Error("Organization not loaded");
	}

	return useSuspenseQuery(
		orpc.finance.summary.queryOptions({
			input: { organizationId, period },
		}),
	).data;
}

/** Detail behind the headline. Non-suspense: it sits behind a disclosure, so
 *  the page must not block on it. */
export function useFinanceBreakdown(period: FinancePeriod, enabled: boolean) {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId && enabled
			? orpc.finance.breakdown.queryOptions({
					input: { organizationId, period },
				})
			: disabledQuery(["finance", "breakdown", period]),
	);

	return {
		breakdown: query.data,
		isLoading: query.isLoading,
	};
}

export function useFinanceTrend(months = 12) {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? orpc.finance.trend.queryOptions({
					input: { organizationId, months },
				})
			: disabledQuery(["finance", "trend", String(months)]),
	);

	return {
		points: query.data?.points ?? [],
		isLoading: query.isLoading,
	};
}

export function useMoneyMap(enabled = true) {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId && enabled
			? orpc.finance.moneyMap.get.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["finance", "moneyMap"]),
	);

	return {
		categories: query.data?.categories ?? [],
		lines: query.data?.lines ?? [],
		coverage: query.data?.coverage ?? 1,
		needsSetup: query.data?.needsSetup ?? false,
		totalSpend: query.data?.totalSpend ?? 0,
		isLoading: query.isLoading,
	};
}

export function useSaveMoneyMap() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.finance.moneyMap.save.mutationOptions(),
		onSuccess: () => {
			// Classifying a line changes every downstream money figure.
			queryClient.invalidateQueries({ queryKey: orpc.finance.key() });
		},
	});
}

export function useFinanceCategories() {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? orpc.finance.categories.list.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["finance", "categories"]),
	);

	return {
		categories: query.data?.categories ?? [],
		isLoading: query.isLoading,
	};
}
