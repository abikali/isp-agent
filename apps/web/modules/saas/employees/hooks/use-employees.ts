"use client";

import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";

interface EmployeeListInput {
	search?: string | undefined;
	status?: "ACTIVE" | "INACTIVE" | "ON_LEAVE" | undefined;
	department?:
		| "TECHNICAL"
		| "CUSTOMER_SERVICE"
		| "BILLING"
		| "MANAGEMENT"
		| "FIELD_OPS"
		| undefined;
	stationId?: string | undefined;
	page?: number | undefined;
	pageSize?: number | undefined;
	sortBy?: "name" | "employeeNumber" | "createdAt" | "status" | undefined;
	sortOrder?: "asc" | "desc" | undefined;
}

export function useEmployees(filters: EmployeeListInput = {}) {
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
	if (filters.department) {
		input["department"] = filters.department;
	}
	if (filters.stationId) {
		input["stationId"] = filters.stationId;
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
		orpc.employees.list.queryOptions({
			input: input as Parameters<
				typeof orpc.employees.list.queryOptions
			>[0]["input"],
		}),
	);

	return {
		employees: query.data?.employees ?? [],
		total: query.data?.total ?? 0,
		page: query.data?.page ?? 1,
		pageSize: query.data?.pageSize ?? 25,
		totalPages: query.data?.totalPages ?? 0,
	};
}

export function useEmployeeStats() {
	const organizationId = useOrganizationId();

	const query = useSuspenseQuery(
		orpc.employees.stats.queryOptions({
			input: { organizationId: organizationId ?? "" },
		}),
	);

	return query.data;
}

export function useEmployeesQuery() {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? orpc.employees.list.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["employees", "list"]),
	);

	return {
		employees: query.data?.employees ?? [],
		isLoading: query.isLoading,
	};
}

export function useCreateEmployee() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.employees.create.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.employees.key(),
			});
		},
	});
}

export function useUpdateEmployee() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.employees.update.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.employees.key(),
			});
		},
	});
}

export function useDeleteEmployee() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.employees.delete.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.employees.key(),
			});
		},
	});
}

export function useAssignStations() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.employees.assignStations.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.employees.key(),
			});
		},
	});
}

export function useEmployeeBulkImport() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.employees.bulkImport.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.employees.key(),
			});
		},
	});
}

export function useEmployeeBulkExport() {
	return useMutation({
		...orpc.employees.bulkExport.mutationOptions(),
	});
}
