"use client";

import { orpc } from "@shared/lib/orpc";
import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";

interface DealerListInput {
	organizationId?: string | undefined;
	search?: string | undefined;
	status?: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "PENDING" | undefined;
	page?: number | undefined;
	pageSize?: number | undefined;
	sortBy?: "name" | "companyName" | "credit" | "createdAt" | undefined;
	sortOrder?: "asc" | "desc" | undefined;
}

export function useDealers(filters: DealerListInput = {}) {
	const input: Record<string, unknown> = {};
	if (filters.organizationId) {
		input["organizationId"] = filters.organizationId;
	}
	if (filters.search) {
		input["search"] = filters.search;
	}
	if (filters.status) {
		input["status"] = filters.status;
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
		orpc.admin.dealers.list.queryOptions({
			input: input as Parameters<
				typeof orpc.admin.dealers.list.queryOptions
			>[0]["input"],
		}),
	);

	return {
		dealers: query.data?.dealers ?? [],
		total: query.data?.total ?? 0,
		page: query.data?.page ?? 1,
		pageSize: query.data?.pageSize ?? 25,
		totalPages: query.data?.totalPages ?? 0,
		isLoading: query.isLoading,
		isFetching: query.isFetching,
	};
}

export function useDealerStats(organizationId?: string) {
	const input: Record<string, unknown> = {};
	if (organizationId) {
		input["organizationId"] = organizationId;
	}

	const query = useSuspenseQuery(
		orpc.admin.dealers.stats.queryOptions({
			input: input as Parameters<
				typeof orpc.admin.dealers.stats.queryOptions
			>[0]["input"],
		}),
	);

	return query.data;
}

export function useDealersQuery(organizationId?: string) {
	const input: Record<string, unknown> = {};
	if (organizationId) {
		input["organizationId"] = organizationId;
	}

	const query = useQuery(
		orpc.admin.dealers.list.queryOptions({
			input: input as Parameters<
				typeof orpc.admin.dealers.list.queryOptions
			>[0]["input"],
		}),
	);

	return {
		dealers: query.data?.dealers ?? [],
		isLoading: query.isLoading,
	};
}

export function useCreateDealer() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.admin.dealers.create.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.admin.dealers.key(),
			});
		},
	});
}

export function useUpdateDealer() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.admin.dealers.update.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.admin.dealers.key(),
			});
		},
	});
}

export function useDeleteDealer() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.admin.dealers.delete.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.admin.dealers.key(),
			});
		},
	});
}

export function useSyncDealers() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.admin.dealers.sync.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.admin.dealers.key(),
			});
		},
	});
}

export function useDealerSyncStatus(operationId: string | null) {
	return useQuery({
		...orpc.admin.dealers.syncStatus.queryOptions({
			input: operationId ? { operationId } : {},
		}),
		refetchInterval: (query) => {
			const status = query.state.data?.operation?.status;
			if (status === "pending" || status === "in_progress") {
				return 2000;
			}
			return false;
		},
	});
}
