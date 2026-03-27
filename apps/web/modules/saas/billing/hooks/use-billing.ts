"use client";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";

// ─── Billing Cycles ─────────────────────────────────────────────

export function useCurrentCycle() {
	const organizationId = useOrganizationId();

	return useQuery(
		organizationId
			? orpc.billing.cycles.current.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["billing", "cycles", "current"]),
	);
}

export function useBillingCycles() {
	const organizationId = useOrganizationId();

	return useQuery(
		organizationId
			? orpc.billing.cycles.list.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["billing", "cycles", "list"]),
	);
}

// ─── Payment Stats (suspense) ───────────────────────────────────

export function usePaymentStats(billingCycleId?: string) {
	const organizationId = useOrganizationId();

	const query = useSuspenseQuery(
		orpc.billing.payments.stats.queryOptions({
			input: {
				organizationId: organizationId ?? "",
				billingCycleId,
			},
		}),
	);

	return query.data;
}

// ─── Payment Stats (non-suspense) ───────────────────────────────

export function usePaymentStatsQuery(billingCycleId?: string) {
	const organizationId = useOrganizationId();

	return useQuery(
		organizationId
			? orpc.billing.payments.stats.queryOptions({
					input: { organizationId, billingCycleId },
				})
			: disabledQuery(["billing", "payments", "stats"]),
	);
}

// ─── Payments List (suspense) ───────────────────────────────────

export function usePayments(filters: {
	billingCycleId?: string;
	collectorId?: string;
	status?: "PENDING" | "PROCESSED" | "PARTIAL" | "STOPPED";
	groupName?: string;
	search?: string;
	page?: number;
	pageSize?: number;
}) {
	const organizationId = useOrganizationId();

	const query = useSuspenseQuery(
		orpc.billing.payments.list.queryOptions({
			input: {
				organizationId: organizationId ?? "",
				...filters,
				page: filters.page ?? 1,
				pageSize: filters.pageSize ?? 25,
			},
		}),
	);

	return {
		payments: query.data.payments,
		total: query.data.total,
		page: query.data.page,
		pageSize: query.data.pageSize,
		totalPages: query.data.totalPages,
	};
}

// ─── Unpaid Customers (suspense) ────────────────────────────────

export function useUnpaidCustomers(filters: {
	collectorId?: string;
	groupName?: string;
	search?: string;
	expiryFrom?: string;
	expiryTo?: string;
	page?: number;
	pageSize?: number;
}) {
	const organizationId = useOrganizationId();

	const query = useSuspenseQuery(
		orpc.billing.unpaid.list.queryOptions({
			input: {
				organizationId: organizationId ?? "",
				...filters,
				page: filters.page ?? 1,
				pageSize: filters.pageSize ?? 25,
			},
		}),
	);

	return {
		customers: query.data.customers,
		total: query.data.total,
		page: query.data.page,
		pageSize: query.data.pageSize,
		totalPages: query.data.totalPages,
	};
}

// ─── Stopped Accounts (suspense) ────────────────────────────────

export function useStoppedAccounts(filters: {
	search?: string;
	groupName?: string;
	collectorId?: string;
	page?: number;
	pageSize?: number;
}) {
	const organizationId = useOrganizationId();

	const query = useSuspenseQuery(
		orpc.billing.stopped.list.queryOptions({
			input: {
				organizationId: organizationId ?? "",
				...filters,
				page: filters.page ?? 1,
				pageSize: filters.pageSize ?? 25,
			},
		}),
	);

	return {
		payments: query.data.payments,
		total: query.data.total,
		page: query.data.page,
		pageSize: query.data.pageSize,
		totalPages: query.data.totalPages,
	};
}

// ─── Mutations ──────────────────────────────────────────────────

export function useCreatePayment() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.billing.payments.create.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.billing.key(),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.customers.key(),
			});
		},
	});
}

export function useProcessPayment() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.billing.payments.process.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.billing.key(),
			});
		},
	});
}

export function useBulkProcessPayments() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.billing.payments.bulkProcess.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.billing.key(),
			});
		},
	});
}

export function useCloseCycle() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.billing.cycles.close.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.billing.key(),
			});
		},
	});
}

export function useReactivateAccount() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.billing.stopped.reactivate.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.billing.key(),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.customers.key(),
			});
		},
	});
}

// ─── Billing Sync ───────────────────────────────────────────────

export function useTestBilling() {
	return useMutation(orpc.billing.sync.test.mutationOptions());
}

export function usePreviewBillingSync() {
	return useMutation(orpc.billing.sync.preview.mutationOptions());
}

export function useSyncFromBilling() {
	return useMutation(orpc.billing.sync.start.mutationOptions());
}

export function useBillingSyncStatus(
	organizationId: string | null,
	operationId: string | null,
) {
	return useQuery({
		...orpc.billing.sync.status.queryOptions({
			input: {
				organizationId: organizationId ?? "",
				...(operationId ? { operationId } : {}),
			},
		}),
		enabled: !!organizationId,
		refetchInterval: (query) => {
			const status = query.state.data?.operation?.status;
			if (status === "pending" || status === "in_progress") {
				return 2000;
			}
			return false;
		},
	});
}
