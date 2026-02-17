"use client";

import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";

export function useStations() {
	const organizationId = useOrganizationId();

	const query = useSuspenseQuery(
		orpc.stations.list.queryOptions({
			input: { organizationId: organizationId ?? "" },
		}),
	);

	return { stations: query.data?.stations ?? [] };
}

export function useStationsQuery() {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? orpc.stations.list.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["stations", "list"]),
	);

	return {
		stations: query.data?.stations ?? [],
		isLoading: query.isLoading,
	};
}

export function useCreateStation() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.stations.create.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.stations.list.key(),
			});
		},
	});
}

export function useUpdateStation() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.stations.update.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.stations.key(),
			});
		},
	});
}

export function useDeleteStation() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.stations.delete.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.stations.list.key(),
			});
		},
	});
}
