"use client";

import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";

interface CustomerListInput {
	search?: string | undefined;
	status?:
		| "ACTIVE"
		| "INACTIVE"
		| "SUSPENDED"
		| "PENDING"
		| "EXPIRED"
		| undefined;
	planId?: string | undefined;
	stationId?: string | undefined;
	connectionType?:
		| "FIBER"
		| "WIRELESS"
		| "DSL"
		| "CABLE"
		| "ETHERNET"
		| undefined;
	groupName?: string | undefined;
	collectorId?: string | undefined;
	page?: number | undefined;
	pageSize?: number | undefined;
	sortBy?:
		| "lastName"
		| "accountNumber"
		| "createdAt"
		| "status"
		| "balance"
		| "username"
		| undefined;
	sortOrder?: "asc" | "desc" | undefined;
}

export function useCustomers(filters: CustomerListInput = {}) {
	const organizationId = useOrganizationId();

	const input: Record<string, unknown> = {
		organizationId: organizationId ?? "",
	};
	if (filters.search) {
		input["search"] = filters.search;
	}
	if (filters.status) {
		input["status"] = filters.status;
	}
	if (filters.planId) {
		input["planId"] = filters.planId;
	}
	if (filters.stationId) {
		input["stationId"] = filters.stationId;
	}
	if (filters.connectionType) {
		input["connectionType"] = filters.connectionType;
	}
	if (filters.groupName) {
		input["groupName"] = filters.groupName;
	}
	if (filters.collectorId) {
		input["collectorId"] = filters.collectorId;
	}
	if (filters.page) {
		input["page"] = filters.page;
	}
	if (filters.pageSize) {
		input["pageSize"] = filters.pageSize;
	}
	if (filters.sortBy) {
		input["sortBy"] = filters.sortBy;
	}
	if (filters.sortOrder) {
		input["sortOrder"] = filters.sortOrder;
	}

	const query = useQuery(
		orpc.customers.list.queryOptions({
			input: input as Parameters<
				typeof orpc.customers.list.queryOptions
			>[0]["input"],
		}),
	);

	return {
		customers: query.data?.customers ?? [],
		total: query.data?.total ?? 0,
		page: query.data?.page ?? 1,
		pageSize: query.data?.pageSize ?? 25,
		totalPages: query.data?.totalPages ?? 0,
		isLoading: query.isLoading,
		isFetching: query.isFetching,
	};
}

export function useCustomerStats() {
	const organizationId = useOrganizationId();

	const query = useSuspenseQuery(
		orpc.customers.stats.queryOptions({
			input: { organizationId: organizationId ?? "" },
		}),
	);

	return query.data;
}

export function useCustomerStatsQuery() {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? orpc.customers.stats.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["customers", "stats"]),
	);

	return {
		stats: query.data,
		isLoading: query.isLoading,
	};
}

export function useCreateCustomer() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.customers.create.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.customers.key(),
			});
		},
	});
}

export function useUpdateCustomer() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.customers.update.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.customers.key(),
			});
		},
	});
}

export function useDeleteCustomer() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.customers.delete.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.customers.key(),
			});
		},
	});
}

export function usePreviewAccountTypeChange() {
	return useMutation({
		...orpc.customers.previewAccountTypeChange.mutationOptions(),
	});
}

export function useExecuteAccountTypeChange() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.customers.executeAccountTypeChange.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.customers.key(),
			});
		},
	});
}

export function useResetMacAddress() {
	const queryClient = useQueryClient();
	return useMutation({
		...orpc.customers.resetMacAddress.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: orpc.customers.key() });
		},
	});
}

export function useUpdateNameInIRadius() {
	const queryClient = useQueryClient();
	return useMutation({
		...orpc.customers.updateNameInIRadius.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: orpc.customers.key() });
		},
	});
}

export function useSetDiscount() {
	const queryClient = useQueryClient();
	return useMutation({
		...orpc.customers.setDiscount.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: orpc.customers.key() });
		},
	});
}

export function useSetIptvPrice() {
	const queryClient = useQueryClient();
	return useMutation({
		...orpc.customers.setIptvPrice.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: orpc.customers.key() });
		},
	});
}

export function useCreateLocationRequest() {
	return useMutation({
		...orpc.customers.createLocationRequest.mutationOptions(),
	});
}

export function useBulkImport() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.customers.bulkImport.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.customers.key(),
			});
		},
	});
}

export function useBulkExport() {
	return useMutation({
		...orpc.customers.bulkExport.mutationOptions(),
	});
}

export function useSetCustomerPin() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.customers.setPin.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.customers.key(),
			});
		},
	});
}

export function useResetCustomerPin() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.customers.resetPin.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.customers.key(),
			});
		},
	});
}

export function useGenerateCustomerPin() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.customers.generatePin.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.customers.key(),
			});
		},
	});
}

export function useTestIRadius() {
	return useMutation({
		...orpc.customers.testIRadius.mutationOptions(),
	});
}

export function useSyncFromIRadius() {
	return useMutation({
		...orpc.customers.syncFromIRadius.mutationOptions(),
	});
}

export function useCancelIRadiusSync() {
	const queryClient = useQueryClient();
	return useMutation({
		...orpc.customers.cancelIRadiusSync.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.customers.key(),
			});
		},
	});
}

export function useIRadiusSyncStatus(
	organizationId: string | null,
	operationId: string | null,
) {
	return useQuery({
		...orpc.customers.getIRadiusSyncStatus.queryOptions({
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

// ---------------------------------------------------------------------------
// Sync Conflict Hooks
// ---------------------------------------------------------------------------

export function useSyncConflicts(
	organizationId: string | null,
	filters: {
		status?: "pending" | "resolved" | "all";
		page?: number;
		pageSize?: number;
	} = {},
) {
	return useQuery(
		organizationId
			? orpc.customers.listSyncConflicts.queryOptions({
					input: {
						organizationId,
						status: filters.status ?? "pending",
						page: filters.page ?? 1,
						pageSize: filters.pageSize ?? 25,
					},
				})
			: disabledQuery(["customers", "listSyncConflicts"]),
	);
}

export function useSyncConflictsSummary(organizationId: string | null) {
	return useQuery(
		organizationId
			? orpc.customers.getSyncConflictsSummary.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["customers", "getSyncConflictsSummary"]),
	);
}

export function useResolveSyncConflict() {
	const queryClient = useQueryClient();
	return useMutation({
		...orpc.customers.resolveSyncConflict.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.customers.key(),
			});
		},
	});
}

export function useBulkResolveSyncConflicts() {
	const queryClient = useQueryClient();
	return useMutation({
		...orpc.customers.bulkResolveSyncConflicts.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.customers.key(),
			});
		},
	});
}

// ---------------------------------------------------------------------------
// Per-Entity Sync Hooks
// ---------------------------------------------------------------------------

export function usePreviewIRadiusEntitySync() {
	return useMutation({
		...orpc.customers.previewIRadiusEntitySync.mutationOptions(),
	});
}

export function useApplyIRadiusEntitySync() {
	const queryClient = useQueryClient();
	return useMutation({
		...orpc.customers.applyIRadiusEntitySync.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.customers.key(),
			});
		},
	});
}
