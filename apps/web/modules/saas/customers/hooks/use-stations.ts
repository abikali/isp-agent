"use client";

import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";

export function useStations(filters?: { search?: string; online?: boolean }) {
	const organizationId = useOrganizationId();

	const query = useSuspenseQuery({
		...orpc.stations.list.queryOptions({
			input: {
				organizationId: organizationId ?? "",
				...filters,
			},
		}),
		refetchInterval: 15000,
		refetchIntervalInBackground: false,
	});

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
