"use client";

import { createInvalidatingMutation } from "@shared/hooks/create-invalidating-mutation";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";

export function useStations(filters?: {
	search?: string;
	status?: "ACTIVE" | "MAINTENANCE" | "OFFLINE";
	online?: boolean;
}) {
	const organizationId = useOrganizationId();

	const query = useSuspenseQuery(
		orpc.stations.list.queryOptions({
			input: {
				organizationId: organizationId ?? "",
				...filters,
			},
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

export const useCreateStation = createInvalidatingMutation(
	() => orpc.stations.create.mutationOptions(),
	() => orpc.stations.key(),
);

export const useUpdateStation = createInvalidatingMutation(
	() => orpc.stations.update.mutationOptions(),
	() => orpc.stations.key(),
);

export const useDeleteStation = createInvalidatingMutation(
	() => orpc.stations.delete.mutationOptions(),
	() => orpc.stations.key(),
);
