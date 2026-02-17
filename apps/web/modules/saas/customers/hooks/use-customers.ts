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
	status?: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "PENDING" | undefined;
	planId?: string | undefined;
	stationId?: string | undefined;
	connectionType?:
		| "FIBER"
		| "WIRELESS"
		| "DSL"
		| "CABLE"
		| "ETHERNET"
		| undefined;
	page?: number | undefined;
	pageSize?: number | undefined;
	sortBy?: "fullName" | "accountNumber" | "createdAt" | "status" | undefined;
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

	const query = useSuspenseQuery(
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
