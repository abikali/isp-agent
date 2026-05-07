"use client";

import type { CustomerListStatus } from "@repo/api/modules/customers/lib/statuses";
import { createInvalidatingMutation } from "@shared/hooks/create-invalidating-mutation";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useMutation, useQuery, useSuspenseQuery } from "@tanstack/react-query";

interface CustomerListInput {
	search?: string | undefined;
	status?: CustomerListStatus | undefined;
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
	hasLocation?: "yes" | "no" | undefined;
	page?: number | undefined;
	pageSize?: number | undefined;
	sortBy?:
		| "lastName"
		| "accountNumber"
		| "createdAt"
		| "status"
		| "balance"
		| "monthlyRate"
		| "username"
		| "expiresAt"
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
	if (filters.hasLocation) {
		input["hasLocation"] = filters.hasLocation;
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

	const query = useQuery({
		...orpc.customers.list.queryOptions({
			input: input as Parameters<
				typeof orpc.customers.list.queryOptions
			>[0]["input"],
		}),
		refetchInterval: 30_000,
		refetchIntervalInBackground: false,
	});

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

	const query = useSuspenseQuery({
		...orpc.customers.stats.queryOptions({
			input: { organizationId: organizationId ?? "" },
		}),
		refetchInterval: 30_000,
		refetchIntervalInBackground: false,
	});

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

// Every per-customer write — create, update, delete, sync, pin, location,
// iRadius action — invalidates the whole `customers` namespace so the
// list + detail + stats all refetch. One-liners via the shared factory;
// `invalidationKey` lives in `@shared/hooks/create-invalidating-mutation`.
const invalidateCustomers = () => orpc.customers.key();

export const useCreateCustomer = createInvalidatingMutation(
	() => orpc.customers.create.mutationOptions(),
	invalidateCustomers,
);

export const useUpdateCustomer = createInvalidatingMutation(
	() => orpc.customers.update.mutationOptions(),
	invalidateCustomers,
);

export const useDeleteCustomer = createInvalidatingMutation(
	() => orpc.customers.delete.mutationOptions(),
	invalidateCustomers,
);

export const useExecuteAccountTypeChange = createInvalidatingMutation(
	() => orpc.customers.executeAccountTypeChange.mutationOptions(),
	invalidateCustomers,
);

export const useResetMacAddress = createInvalidatingMutation(
	() => orpc.customers.resetMacAddress.mutationOptions(),
	invalidateCustomers,
);

export const useUpdateNameInIRadius = createInvalidatingMutation(
	() => orpc.customers.updateNameInIRadius.mutationOptions(),
	invalidateCustomers,
);

export const useSetDiscount = createInvalidatingMutation(
	() => orpc.customers.setDiscount.mutationOptions(),
	invalidateCustomers,
);

export const useSetIptvPrice = createInvalidatingMutation(
	() => orpc.customers.setIptvPrice.mutationOptions(),
	invalidateCustomers,
);

export const useSetCustomerExpiryDate = createInvalidatingMutation(
	() => orpc.customers.setExpiryDate.mutationOptions(),
	invalidateCustomers,
);

export const useCreateLocationRequest = createInvalidatingMutation(
	() => orpc.customers.createLocationRequest.mutationOptions(),
	invalidateCustomers,
);

export const useBulkRequestLocation = createInvalidatingMutation(
	() => orpc.customers.bulkRequestLocation.mutationOptions(),
	invalidateCustomers,
);

export const useUpdateCustomerLocation = createInvalidatingMutation(
	() => orpc.customers.updateCustomerLocation.mutationOptions(),
	invalidateCustomers,
);

export const useClearCustomerLocation = createInvalidatingMutation(
	() => orpc.customers.clearCustomerLocation.mutationOptions(),
	invalidateCustomers,
);

export const useBulkImport = createInvalidatingMutation(
	() => orpc.customers.bulkImport.mutationOptions(),
	invalidateCustomers,
);

export const useImportFromIRadius = createInvalidatingMutation(
	() => orpc.customers.importFromIRadius.mutationOptions(),
	invalidateCustomers,
);

export const usePushToIRadius = createInvalidatingMutation(
	() => orpc.customers.pushToIRadius.mutationOptions(),
	invalidateCustomers,
);

export const useSetCustomerPin = createInvalidatingMutation(
	() => orpc.customers.setPin.mutationOptions(),
	invalidateCustomers,
);

export const useResetCustomerPin = createInvalidatingMutation(
	() => orpc.customers.resetPin.mutationOptions(),
	invalidateCustomers,
);

export const useGenerateCustomerPin = createInvalidatingMutation(
	() => orpc.customers.generatePin.mutationOptions(),
	invalidateCustomers,
);

export const useCancelIRadiusSync = createInvalidatingMutation(
	() => orpc.customers.cancelIRadiusSync.mutationOptions(),
	invalidateCustomers,
);

export const useResolveSyncConflict = createInvalidatingMutation(
	() => orpc.customers.resolveSyncConflict.mutationOptions(),
	invalidateCustomers,
);

export const useBulkResolveSyncConflicts = createInvalidatingMutation(
	() => orpc.customers.bulkResolveSyncConflicts.mutationOptions(),
	invalidateCustomers,
);

export const useApplyIRadiusEntitySync = createInvalidatingMutation(
	() => orpc.customers.applyIRadiusEntitySync.mutationOptions(),
	invalidateCustomers,
);

// ---------------------------------------------------------------------------
// Mutations that do NOT invalidate on success (previews, exports, tests)
// ---------------------------------------------------------------------------

export function usePreviewAccountTypeChange() {
	return useMutation({
		...orpc.customers.previewAccountTypeChange.mutationOptions(),
	});
}

export function useBulkExport() {
	return useMutation({
		...orpc.customers.bulkExport.mutationOptions(),
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

export function useStartIRadiusPush() {
	return useMutation({
		...orpc.customers.startIRadiusPush.mutationOptions(),
	});
}

export const useCancelIRadiusPush = createInvalidatingMutation(
	() => orpc.customers.cancelIRadiusPush.mutationOptions(),
	invalidateCustomers,
);

export function usePreviewIRadiusEntitySync() {
	return useMutation({
		...orpc.customers.previewIRadiusEntitySync.mutationOptions(),
	});
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

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

export function useIRadiusPushStatus(
	organizationId: string | null,
	operationId: string | null,
) {
	return useQuery({
		...orpc.customers.getIRadiusPushStatus.queryOptions({
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

export function useSyncConflicts(
	organizationId: string | null,
	filters: {
		status?: "pending" | "resolved" | "all";
		fieldName?: string | null;
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
						...(filters.fieldName
							? { fieldName: filters.fieldName }
							: {}),
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

export function useIRadiusGroups() {
	const organizationId = useOrganizationId();
	const query = useQuery(
		organizationId
			? {
					...orpc.customers.listIRadiusGroups.queryOptions({
						input: { organizationId },
					}),
					staleTime: 5 * 60 * 1000,
				}
			: disabledQuery(["customers", "listIRadiusGroups"]),
	);
	return {
		groups: query.data?.groups ?? [],
		isLoading: query.isLoading,
	};
}
