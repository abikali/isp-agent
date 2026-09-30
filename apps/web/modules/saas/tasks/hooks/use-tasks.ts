"use client";

import { useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";

type ListTasksInput = Parameters<
	typeof orpc.tasks.list.queryOptions
>[0]["input"];

type TaskFilters = Omit<ListTasksInput, "organizationId">;

/** A single task row as returned by the list endpoint (with all relations). */
export type TaskListItem = ReturnType<typeof useTasks>["tasks"][number];

export function useTasks(filters: TaskFilters = {}) {
	const organizationId = useOrganizationId();

	const query = useQuery(
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
		isLoading: query.isLoading,
		isFetching: query.isFetching,
	};
}

export function useTaskStats(
	options: {
		sources?: ("MANUAL" | "AI_ESCALATION" | "LEGACY" | "SYSTEM")[];
	} = {},
) {
	const organizationId = useOrganizationId();

	return useSuspenseQuery(
		orpc.tasks.stats.queryOptions({
			input: {
				organizationId: organizationId ?? "",
				...(options.sources ? { sources: options.sources } : {}),
			},
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

/** How many open escalations "Close old…" would close; `days` null = off. */
export function useClosableEscalationsCount(days: number | null) {
	const organizationId = useOrganizationId();

	const query = useQuery({
		...orpc.tasks.countClosableEscalations.queryOptions({
			input: {
				organizationId: organizationId ?? "",
				olderThanDays: days ?? 1,
			},
		}),
		enabled: Boolean(organizationId) && days !== null,
	});

	return {
		count: query.isPlaceholderData ? undefined : query.data?.count,
	};
}

export function useCloseEscalations() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.tasks.closeEscalations.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.tasks.key(),
			});
		},
	});
}

export function useReviewTaskCompletion() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.tasks.reviewCompletion.mutationOptions(),
		onSuccess: () => {
			// Approving / rejecting also approves or reverts the task's
			// installations, recovered items (stock) and cash entries.
			for (const queryKey of [
				orpc.tasks.key(),
				orpc.installations.key(),
				orpc.stock.key(),
				orpc.billing.key(),
			]) {
				queryClient.invalidateQueries({ queryKey });
			}
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
