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

// ─── Customer Groups ───────────────────────────────────────────

export function useCustomerGroups() {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? orpc.billing.groups.list.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["billing", "groups", "list"]),
	);

	return { groups: query.data?.groups ?? [], isLoading: query.isLoading };
}

// ─── Payments List (suspense) ───────────────────────────────────

export function usePayments(filters: {
	billingCycleId?: string;
	collectorId?: string;
	status?: "PENDING" | "PROCESSED" | "PARTIAL" | "STOPPED";
	groupName?: string;
	search?: string;
	dateFrom?: string;
	dateTo?: string;
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

// ─── Collectors ─────────────────────────────────────────────────

export function useCollectors() {
	const organizationId = useOrganizationId();

	return useQuery(
		organizationId
			? orpc.billing.collectors.list.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["billing", "collectors", "list"]),
	);
}

export function useCollectorBalance(collectorId: string | null) {
	const organizationId = useOrganizationId();

	return useQuery(
		organizationId && collectorId
			? orpc.billing.collectors.balance.queryOptions({
					input: { organizationId, collectorId },
				})
			: disabledQuery(["billing", "collectors", "balance"]),
	);
}

export function useCollectorStats(collectorId?: string) {
	const organizationId = useOrganizationId();

	return useQuery(
		organizationId
			? orpc.billing.collectors.stats.queryOptions({
					input: { organizationId, collectorId },
				})
			: disabledQuery(["billing", "collectors", "stats"]),
	);
}

// ─── Cash Collections ───────────────────────────────────────────

export function useCollections(filters: {
	collectorId?: string;
	dateFrom?: string;
	dateTo?: string;
	page?: number;
	pageSize?: number;
}) {
	const organizationId = useOrganizationId();

	return useSuspenseQuery(
		orpc.billing.collections.list.queryOptions({
			input: {
				organizationId: organizationId ?? "",
				...filters,
				page: filters.page ?? 1,
				pageSize: filters.pageSize ?? 25,
			},
		}),
	);
}

export function useCreateCollection() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.billing.collections.create.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.billing.key(),
			});
		},
	});
}

export function useDeleteCollection() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.billing.collections.delete.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.billing.key(),
			});
		},
	});
}

// ─── Request Location ───────────────────────────────────────

export function useRequestLocation() {
	return useMutation(orpc.billing.location.request.mutationOptions());
}

// ─── Delete Payment ─────────────────────────────────────────────

export function useDeletePayment() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.billing.payments.delete.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.billing.payments.key(),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.billing.collectors.key(),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.billing.unpaid.key(),
			});
		},
	});
}

// ─── Reports ────────────────────────────────────────────────────

export function useAccountingReports(
	scope: "month" | "all" = "month",
	billingCycleId?: string,
) {
	const organizationId = useOrganizationId();

	return useSuspenseQuery(
		orpc.billing.reports.queryOptions({
			input: {
				organizationId: organizationId ?? "",
				scope,
				billingCycleId,
			},
		}),
	);
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
