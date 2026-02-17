"use client";

import { useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";

interface TaskListInput {
	search?: string | undefined;
	status?:
		| "OPEN"
		| "IN_PROGRESS"
		| "ON_HOLD"
		| "COMPLETED"
		| "CANCELLED"
		| undefined;
	priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT" | undefined;
	category?:
		| "INSTALLATION"
		| "MAINTENANCE"
		| "REPAIR"
		| "SUPPORT"
		| "BILLING"
		| "GENERAL"
		| undefined;
	employeeId?: string | undefined;
	customerId?: string | undefined;
	stationId?: string | undefined;
	page?: number | undefined;
	pageSize?: number | undefined;
	sortBy?:
		| "title"
		| "createdAt"
		| "dueDate"
		| "priority"
		| "status"
		| undefined;
	sortOrder?: "asc" | "desc" | undefined;
}

export function useTasks(filters: TaskListInput = {}) {
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
	if (filters.priority) {
		input["priority"] = filters.priority;
	}
	if (filters.category) {
		input["category"] = filters.category;
	}
	if (filters.employeeId) {
		input["employeeId"] = filters.employeeId;
	}
	if (filters.customerId) {
		input["customerId"] = filters.customerId;
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
		orpc.tasks.list.queryOptions({
			input: input as Parameters<
				typeof orpc.tasks.list.queryOptions
			>[0]["input"],
		}),
	);

	return {
		tasks: query.data?.tasks ?? [],
		total: query.data?.total ?? 0,
		page: query.data?.page ?? 1,
		pageSize: query.data?.pageSize ?? 25,
		totalPages: query.data?.totalPages ?? 0,
	};
}

export function useTaskStats() {
	const organizationId = useOrganizationId();

	const query = useSuspenseQuery(
		orpc.tasks.stats.queryOptions({
			input: { organizationId: organizationId ?? "" },
		}),
	);

	return query.data;
}

export function useCreateTask() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.tasks.create.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.tasks.key(),
			});
		},
	});
}

export function useUpdateTask() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.tasks.update.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.tasks.key(),
			});
		},
	});
}

export function useDeleteTask() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.tasks.delete.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.tasks.key(),
			});
		},
	});
}

export function useAssignTaskEmployees() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.tasks.assignEmployees.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.tasks.key(),
			});
		},
	});
}
