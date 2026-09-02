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
export function useDealerFinanceOverview() {
	const organizationId = useOrganizationId();
	if (!organizationId) {
		throw new Error("Organization not loaded");
	}
	return useSuspenseQuery(
		orpc.dealers.overview.queryOptions({ input: { organizationId } }),
	).data;
}

export type DealerFinanceOverview = ReturnType<typeof useDealerFinanceOverview>;
export type DealerFinanceRow = DealerFinanceOverview["dealers"][number];

export function useDealerFinanceLedger(dealerId: string) {
	const organizationId = useOrganizationId();
	if (!organizationId) {
		throw new Error("Organization not loaded");
	}
	return useSuspenseQuery(
		orpc.dealers.ledger.queryOptions({
			input: { organizationId, dealerId },
		}),
	).data;
}

export type DealerFinanceLedger = ReturnType<typeof useDealerFinanceLedger>;
export type DealerLedgerEntry = DealerFinanceLedger["entries"][number];

function useInvalidateDealerFinance() {
	const queryClient = useQueryClient();
	return () => {
		queryClient.invalidateQueries({ queryKey: orpc.dealers.key() });
		queryClient.invalidateQueries({ queryKey: orpc.finance.key() });
	};
}

export function useAdjustDealerCredit() {
	const invalidate = useInvalidateDealerFinance();
	return useMutation({
		...orpc.dealers.adjustCredit.mutationOptions(),
		onSuccess: invalidate,
	});
}

export function useRecordDealerPayment() {
	const invalidate = useInvalidateDealerFinance();
	return useMutation({
		...orpc.dealers.recordPayment.mutationOptions(),
		onSuccess: invalidate,
	});
}

export function useSyncDealerFinance() {
	return useMutation(orpc.dealers.syncNow.mutationOptions());
}

/** Polls while a sync is queued or running, then stops. */
export function useDealerFinanceSyncStatus(operationId: string | null) {
	const organizationId = useOrganizationId();
	return useQuery({
		...(organizationId && operationId
			? orpc.dealers.syncStatus.queryOptions({
					input: { organizationId, operationId },
				})
			: disabledQuery(["dealers", "syncStatus", operationId ?? ""])),
		refetchInterval: (query) => {
			const status = query.state.data?.operation?.status;
			return status === "pending" || status === "in_progress"
				? 2000
				: false;
		},
	});
}
