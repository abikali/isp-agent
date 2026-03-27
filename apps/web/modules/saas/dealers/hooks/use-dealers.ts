"use client";

import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";

interface DealerListInput {
	search?: string | undefined;
	status?: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "PENDING" | undefined;
	page?: number | undefined;
	pageSize?: number | undefined;
}

export function useDealers(filters: DealerListInput = {}) {
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
	if (filters.page) {
		input["page"] = filters.page;
	}
	if (filters.pageSize) {
		input["pageSize"] = filters.pageSize;
	}

	const query = useQuery(
		orpc.dealers.list.queryOptions({
			input: input as Parameters<
				typeof orpc.dealers.list.queryOptions
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

export function useDealerStats() {
	const organizationId = useOrganizationId();

	const query = useSuspenseQuery(
		orpc.dealers.stats.queryOptions({
			input: { organizationId: organizationId ?? "" },
		}),
	);

	return query.data;
}

export function useDealersQuery() {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? orpc.dealers.list.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["dealers", "list"]),
	);

	return {
		dealers: query.data?.dealers ?? [],
		isLoading: query.isLoading,
	};
}

export function useCreateDealer() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.dealers.create.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.dealers.key(),
			});
		},
	});
}

export function useUpdateDealer() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.dealers.update.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.dealers.key(),
			});
		},
	});
}

export function useDeleteDealer() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.dealers.delete.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.dealers.key(),
			});
		},
	});
}
