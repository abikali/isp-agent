"use client";

import { useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useSuspenseQuery } from "@tanstack/react-query";

export function useWatcherExecutions(watcherId: string) {
	const organizationId = useOrganizationId();

	const query = useSuspenseQuery(
		orpc.watchers.listExecutions.queryOptions({
			input: {
				organizationId: organizationId ?? "",
				watcherId,
				limit: 50,
			},
		}),
	);

	return {
		executions: query.data?.executions ?? [],
		nextCursor: query.data?.nextCursor,
	};
}

export function useWatcherStats() {
	const organizationId = useOrganizationId();

	const query = useSuspenseQuery(
		orpc.watchers.getStats.queryOptions({
			input: { organizationId: organizationId ?? "" },
		}),
	);

	return query.data;
}
