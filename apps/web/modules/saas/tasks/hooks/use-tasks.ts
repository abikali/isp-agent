"use client";

import { useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";

type ListTasksInput = Parameters<
	typeof orpc.tasks.list.queryOptions
>[0]["input"];

type TaskFilters = Omit<ListTasksInput, "organizationId">;

export function useTasks(filters: TaskFilters = {}) {
	const organizationId = useOrganizationId();

	const query = useSuspenseQuery(
		orpc.tasks.list.queryOptions({
			input: {
				organizationId: organizationId ?? "",
				...filters,
			},
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

	return useSuspenseQuery(
		orpc.tasks.stats.queryOptions({
			input: { organizationId: organizationId ?? "" },
		}),
	).data;
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
