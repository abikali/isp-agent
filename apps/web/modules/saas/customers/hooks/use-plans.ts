"use client";

import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";

export function usePlans() {
	const organizationId = useOrganizationId();

	const query = useSuspenseQuery(
		orpc.servicePlans.list.queryOptions({
			input: { organizationId: organizationId ?? "" },
		}),
	);

	return { plans: query.data?.plans ?? [] };
}

export function usePlansQuery() {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? orpc.servicePlans.list.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["servicePlans", "list"]),
	);

	return {
		plans: query.data?.plans ?? [],
		isLoading: query.isLoading,
	};
}

export function useCreatePlan() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.servicePlans.create.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.servicePlans.list.key(),
			});
		},
	});
}

export function useUpdatePlan() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.servicePlans.update.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.servicePlans.key(),
			});
		},
	});
}

export function useDeletePlan() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.servicePlans.delete.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.servicePlans.list.key(),
			});
		},
	});
}
