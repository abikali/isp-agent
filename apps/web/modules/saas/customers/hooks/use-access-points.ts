"use client";

import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";

export function useAccessPoints(filters?: {
	search?: string;
	stationId?: string;
	online?: boolean;
}) {
	const organizationId = useOrganizationId();

	const query = useSuspenseQuery({
		...orpc.accessPoints.list.queryOptions({
			input: {
				organizationId: organizationId ?? "",
				...filters,
			},
		}),
		refetchInterval: 15000,
		refetchIntervalInBackground: false,
	});

	return { accessPoints: query.data?.accessPoints ?? [] };
}

export function useAccessPointsQuery() {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? orpc.accessPoints.list.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["accessPoints", "list"]),
	);

	return {
		accessPoints: query.data?.accessPoints ?? [],
		isLoading: query.isLoading,
	};
}
