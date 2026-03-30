"use client";
import type { PaymentStatus } from "@repo/database/enums";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { useState } from "react";
import { buildCycleOptions } from "../lib/billing-utils";

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

// ─── Cycle Filter (shared state for cycle dropdowns) ────────────

export function useCycleFilter() {
	const [cycleFilter, setCycleFilter] = useState<string>("");
	const { data: currentCycleData } = useCurrentCycle();
	const { data: cyclesData } = useBillingCycles();

	const options = buildCycleOptions(cyclesData?.cycles ?? []);
	const isAll = cycleFilter === "all";
	const activeCycleId = isAll
		? undefined
		: cycleFilter || currentCycleData?.cycle?.id;

	return {
		cycleFilter,
		setCycleFilter,
		activeCycleId,
		isAll,
		options,
		currentCycleId: currentCycleData?.cycle?.id,
	};
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
	status?: PaymentStatus;
	groupName?: string;
	search?: string;
	dateFrom?: string;
	dateTo?: string;
	page?: number;
	pageSize?: number;
	refetchInterval?: number;
}) {
	const organizationId = useOrganizationId();
	const { refetchInterval, ...queryFilters } = filters;

	const query = useSuspenseQuery({
		...orpc.billing.payments.list.queryOptions({
			input: {
				organizationId: organizationId ?? "",
				...queryFilters,
				page: queryFilters.page ?? 1,
				pageSize: queryFilters.pageSize ?? 25,
			},
		}),
		refetchInterval,
	});

	return {
		payments: query.data.payments,
		total: query.data.total,
		page: query.data.page,
		pageSize: query.data.pageSize,
		totalPages: query.data.totalPages,
	};
}

// ─── Payments List (non-suspense) ──────────────────────────────

export function usePaymentsQuery(filters: {
	billingCycleId?: string;
	collectorId?: string;
	status?: PaymentStatus;
	groupName?: string;
	search?: string;
	dateFrom?: string;
	dateTo?: string;
	page?: number;
	pageSize?: number;
}) {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? orpc.billing.payments.list.queryOptions({
					input: {
						organizationId,
						...filters,
						page: filters.page ?? 1,
						pageSize: filters.pageSize ?? 25,
					},
				})
			: disabledQuery(["billing", "payments", "list"]),
	);

	return {
		payments: query.data?.payments ?? [],
		total: query.data?.total ?? 0,
		page: query.data?.page ?? 1,
		pageSize: query.data?.pageSize ?? 25,
		totalPages: query.data?.totalPages ?? 0,
		isLoading: query.isLoading,
		isFetching: query.isFetching,
	};
}

// ─── Unpaid Customers (suspense) ────────────────────────────────

export function useUnpaidCustomers(filters: {
	collectorId?: string;
	groupName?: string;
	excludeGroupName?: string;
	search?: string;
	expiryFrom?: string;
	expiryTo?: string;
	page?: number;
	pageSize?: number;
	refetchInterval?: number;
}) {
	const organizationId = useOrganizationId();
	const { refetchInterval, ...queryFilters } = filters;

	const query = useQuery(
		organizationId
			? {
					...orpc.billing.unpaid.list.queryOptions({
						input: {
							organizationId,
							...queryFilters,
							page: queryFilters.page ?? 1,
							pageSize: queryFilters.pageSize ?? 25,
						},
					}),
					refetchInterval,
				}
			: disabledQuery(["billing", "unpaid", "list"]),
	);

	return {
		customers: query.data?.customers ?? [],
		total: query.data?.total ?? 0,
		totalAmountDue: query.data?.totalAmountDue ?? 0,
		expiredCount: query.data?.expiredCount ?? 0,
		isLoading: query.isLoading,
		page: query.data?.page ?? 1,
		pageSize: query.data?.pageSize ?? 25,
		totalPages: query.data?.totalPages ?? 0,
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

export function useReopenCycle() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.billing.cycles.reopen.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.billing.key(),
			});
		},
	});
}

export function useResetCycle() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.billing.cycles.reset.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.billing.key(),
			});
		},
	});
}

export function useSetActiveCycle() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.billing.cycles.setActive.mutationOptions(),
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

export function useCollectorBalance(
	collectorId: string | null,
	billingCycleId?: string,
) {
	const organizationId = useOrganizationId();

	return useQuery(
		organizationId && collectorId
			? orpc.billing.collectors.balance.queryOptions({
					input: { organizationId, collectorId, billingCycleId },
				})
			: disabledQuery(["billing", "collectors", "balance"]),
	);
}

export function useCollectorStats(
	collectorId?: string,
	refetchInterval?: number,
) {
	const organizationId = useOrganizationId();

	return useQuery(
		organizationId
			? {
					...orpc.billing.collectors.stats.queryOptions({
						input: { organizationId, collectorId },
					}),
					refetchInterval,
				}
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

// ─── Note Categories ────────────────────────────────────────────

export function useNoteCategories() {
	const organizationId = useOrganizationId();

	return useQuery(
		organizationId
			? orpc.billing.noteCategories.list.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["billing", "noteCategories", "list"]),
	);
}

export function useNoteCategoriesSuspense() {
	const organizationId = useOrganizationId();

	return useSuspenseQuery(
		orpc.billing.noteCategories.list.queryOptions({
			input: { organizationId: organizationId ?? "" },
		}),
	);
}

export function useCreateNoteCategory() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.billing.noteCategories.create.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.billing.noteCategories.key(),
			});
		},
	});
}

export function useUpdateNoteCategory() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.billing.noteCategories.update.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.billing.noteCategories.key(),
			});
		},
	});
}

export function useDeleteNoteCategory() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.billing.noteCategories.delete.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.billing.noteCategories.key(),
			});
		},
	});
}

// ─── Billing Sync ───────────────────────────────────────────────

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
