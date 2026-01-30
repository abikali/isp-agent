"use client";

import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useQuery } from "@tanstack/react-query";

/** Query options for API keys - use directly with useQuery or useSuspenseQuery */
export const apiKeysQueryOptions = (organizationId: string) =>
	orpc.apiKeys.list.queryOptions({ input: { organizationId } });

/**
 * Hook to fetch API keys for non-suspense contexts.
 * Uses regular useQuery and gets organizationId from context.
 *
 * For Suspense contexts, use: useSuspenseQuery(apiKeysQueryOptions(orgId))
 */
export function useApiKeysQuery() {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? apiKeysQueryOptions(organizationId)
			: disabledQuery(["apiKeys", "list"]),
	);

	return {
		apiKeys: query.data?.apiKeys ?? [],
		isLoading: query.isLoading,
		refetch: query.refetch,
	};
}
