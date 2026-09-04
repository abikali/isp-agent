"use client";
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

// ─── Billing Months ─────────────────────────────────────────────

export function useCurrentMonth() {
	const organizationId = useOrganizationId();

	return useQuery(
		organizationId
			? orpc.billing.months.current.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["billing", "months", "current"]),
	);
}

export function useBillingMonths() {
	const organizationId = useOrganizationId();

	return useQuery(
		organizationId
			? orpc.billing.months.list.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["billing", "months", "list"]),
	);
}

// ─── Month Filter (shared state for month dropdowns) ────────────

export function useMonthFilter() {
	const [monthFilter, setMonthFilter] = useState<string>("");
	const { data: currentMonthData } = useCurrentMonth();
	const { data: monthsData } = useBillingMonths();

	const options = buildCycleOptions(monthsData?.months ?? []);
	const isAll = monthFilter === "all";
	const activeMonthId = isAll
		? undefined
		: monthFilter || currentMonthData?.month?.id;

	return {
		monthFilter,
		setMonthFilter,
		activeMonthId,
		isAll,
		options,
		currentMonthId: currentMonthData?.month?.id,
	};
}

// ─── Payment Stats (suspense) ───────────────────────────────────

export function usePaymentStats(billingMonthId?: string) {
	const organizationId = useOrganizationId();

	const query = useSuspenseQuery(
		orpc.billing.payments.stats.queryOptions({
			input: {
				organizationId: organizationId ?? "",
				billingMonthId,
			},
		}),
	);

	return query.data;
}

// ─── Payment Stats (non-suspense) ───────────────────────────────

export function usePaymentStatsQuery(billingMonthId?: string) {
	const organizationId = useOrganizationId();

	return useQuery(
		organizationId
			? orpc.billing.payments.stats.queryOptions({
					input: { organizationId, billingMonthId },
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

// ─── Payments List (non-suspense) ──────────────────────────────

export function usePaymentsQuery(filters: {
	billingMonthId?: string;
	collectorId?: string;
	stoppedAccount?: boolean;
	freeAccount?: boolean;
	unreviewedOnly?: boolean;
	reviewedOnly?: boolean;
	noteCategory?: string;
	amountMismatch?: "any" | "overpaid" | "underpaid";
	receiptStatus?: "sent" | "failed" | "pending";
	groupName?: string;
	search?: string;
	dateFrom?: string;
	dateTo?: string;
	page?: number;
	pageSize?: number;
	sortBy?: "paidAt" | "paidAmount" | "stoppedAccount" | "reviewedAt";
	sortOrder?: "asc" | "desc";
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
		error: query.error,
	};
}

// ─── Unpaid Customers (suspense) ────────────────────────────────

export function useUnpaidCustomers(filters: {
	year?: number;
	month?: number;
	collectorId?: string;
	groupName?: string;
	excludeGroupName?: string;
	search?: string;
	expiryFrom?: string;
	expiryTo?: string;
	page?: number;
	pageSize?: number;
	refetchInterval?: number;
	sortBy?: "oldestUnpaidExpiry" | "firstName" | "groupName" | "monthlyRate";
	sortOrder?: "asc" | "desc";
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
		unassignedCount: query.data?.unassignedCount ?? 0,
		isLoading: query.isLoading,
		page: query.data?.page ?? 1,
		pageSize: query.data?.pageSize ?? 25,
		totalPages: query.data?.totalPages ?? 0,
	};
}

// ─── Stopped Accounts (suspense) ────────────────────────────────

export function useStoppedAccounts(filters: {
	year?: number;
	month?: number;
	search?: string;
	groupName?: string;
	collectorId?: string;
	page?: number;
	pageSize?: number;
	sortBy?: "paidAt" | "customerName" | "groupName";
	sortOrder?: "asc" | "desc";
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

export function useToggleMonthLock() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.billing.months.toggleLock.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.billing.months.key(),
			});
		},
	});
}

export function useRegenerateMonthInvoices() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.billing.months.regenerateInvoices.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: orpc.billing.key() });
			queryClient.invalidateQueries({ queryKey: orpc.customers.key() });
		},
	});
}

export function useResetMonth() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.billing.months.reset.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: orpc.billing.key() });
			queryClient.invalidateQueries({ queryKey: orpc.customers.key() });
		},
	});
}

export function useReactivateAccount() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.billing.payments.reactivate.mutationOptions(),
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

export function useDeclineStoppedPayment() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.billing.stopped.decline.mutationOptions(),
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

// ─── Workers (cash) ─────────────────────────────────────────────

export function useWorkers() {
	const organizationId = useOrganizationId();

	return useSuspenseQuery(
		orpc.billing.workers.list.queryOptions({
			input: { organizationId: organizationId ?? "" },
		}),
	);
}

export function useWorkerBalance(workerId: string | null) {
	const organizationId = useOrganizationId();

	return useQuery(
		organizationId && workerId
			? orpc.billing.workers.balance.queryOptions({
					input: { organizationId, workerId },
				})
			: disabledQuery(["billing", "workers", "balance"]),
	);
}

export function usePaySalary() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.expenses.paySalary.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.billing.key(),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.expenses.key(),
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
	sortBy?: "collectedAt" | "amount" | "type";
	sortOrder?: "asc" | "desc";
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
				queryKey: orpc.billing.collections.key(),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.billing.collectors.key(),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.billing.workers.key(),
			});
		},
	});
}

export function useDeleteCollection() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.billing.collections.delete.mutationOptions(),
		onSuccess: (data) => {
			// Deleting a money-given/expense row also removes its linked
			// expense, so refresh the whole billing surface (reports + metric).
			queryClient.invalidateQueries({
				queryKey: orpc.billing.key(),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.expenses.key(),
			});
			// A new-user-setup revert can also flip the subscriber to inactive
			// and re-pend the bundle's installations.
			if (data.installationsReverted) {
				queryClient.invalidateQueries({
					queryKey: orpc.installations.key(),
				});
			}
			if (data.customerDeactivated) {
				queryClient.invalidateQueries({
					queryKey: orpc.customers.key(),
				});
			}
		},
	});
}

// ─── Request Location ───────────────────────────────────────

export function useNotifyLocationNeeded() {
	return useMutation(orpc.billing.location.notifyNeeded.mutationOptions());
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

// ─── Review ─────────────────────────────────────────────────────

export function useReviewPayment() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.billing.payments.review.mutationOptions(),
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

/**
 * "Adjust pricing & review": applies the plan / discount / add-on prices the
 * collector charged for to the customer and reprices the payment + its month
 * to them. Touches the customer row too, so both caches go stale.
 */
export function useRepriceAndReview() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.billing.payments.repriceAndReview.mutationOptions(),
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

export function useReviewPayments() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.billing.payments.reviewMany.mutationOptions(),
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

// ─── Resend Receipt ────────────────────────────────────────────

export function useResendReceipt() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.billing.payments.resendReceipt.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.billing.payments.key(),
			});
		},
	});
}

// ─── Create Location Request (collector-facing) ───────────────

export function useCreateBillingLocationRequest() {
	return useMutation({
		...orpc.billing.location.createRequest.mutationOptions(),
	});
}

// ─── Mark Receipt As Sent ──────────────────────────────────────

export function useMarkReceiptSent() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.billing.payments.markReceiptSent.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.billing.payments.key(),
			});
		},
	});
}

// ─── Reports ────────────────────────────────────────────────────

export function useAccountingReports(
	scope: "month" | "all" = "month",
	billingMonthId?: string,
) {
	const organizationId = useOrganizationId();

	return useSuspenseQuery(
		orpc.billing.reports.queryOptions({
			input: {
				organizationId: organizationId ?? "",
				scope,
				billingMonthId,
			},
		}),
	);
}

// ─── Invoices (org-wide CRUD) ───────────────────────────────────

export function useInvoices(filters: {
	year?: number;
	month?: number;
	search?: string;
	groupName?: string;
	status?: "all" | "paid" | "unpaid";
	page?: number;
	pageSize?: number;
	sortBy?: "invoiceDate" | "total" | "totalWithTax" | "paid" | "expiryDate";
	sortOrder?: "asc" | "desc";
}) {
	const organizationId = useOrganizationId();

	return useQuery(
		organizationId
			? orpc.billing.invoices.list.queryOptions({
					input: { organizationId, ...filters },
				})
			: disabledQuery(["billing", "invoices", "list"]),
	);
}

export function useInvoice(invoiceId: string | null) {
	const organizationId = useOrganizationId();

	return useQuery(
		organizationId && invoiceId
			? orpc.billing.invoices.get.queryOptions({
					input: { organizationId, invoiceId },
				})
			: disabledQuery(["billing", "invoices", "get"]),
	);
}

export function useCreateInvoice() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.billing.invoices.create.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.billing.invoices.key(),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.billing.unpaid.key(),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.customers.listInvoices.key(),
			});
		},
	});
}

export function useUpdateInvoice() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.billing.invoices.update.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.billing.invoices.key(),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.billing.unpaid.key(),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.customers.listInvoices.key(),
			});
		},
	});
}

export function useDeleteInvoice() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.billing.invoices.delete.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.billing.invoices.key(),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.billing.unpaid.key(),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.customers.listInvoices.key(),
			});
		},
	});
}

export function useVoidInvoice() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.billing.invoices.void.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.billing.invoices.key(),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.billing.unpaid.key(),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.customers.listInvoices.key(),
			});
		},
	});
}

export function useVoidInvoices() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.billing.invoices.voidMany.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.billing.invoices.key(),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.billing.unpaid.key(),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.customers.listInvoices.key(),
			});
		},
	});
}

export function useVoidUnpaidForCustomers() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.billing.invoices.voidUnpaidForCustomers.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.billing.invoices.key(),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.billing.unpaid.key(),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.customers.listInvoices.key(),
			});
		},
	});
}

export function useUnvoidInvoice() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.billing.invoices.unvoid.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.billing.invoices.key(),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.billing.unpaid.key(),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.customers.listInvoices.key(),
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
