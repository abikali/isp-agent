"use client";

import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useQuery } from "@tanstack/react-query";

/** Query options for webhooks - use directly with useQuery or useSuspenseQuery */
export const webhooksQueryOptions = (organizationId: string) =>
	orpc.webhooks.list.queryOptions({ input: { organizationId } });

/**
 * Hook to fetch webhooks for non-suspense contexts.
 * Uses regular useQuery and gets organizationId from context.
 *
 * For Suspense contexts, use: useSuspenseQuery(webhooksQueryOptions(orgId))
 */
export function useWebhooksQuery() {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? webhooksQueryOptions(organizationId)
			: disabledQuery(["webhooks", "list"]),
	);

	return {
		webhooks: query.data?.webhooks ?? [],
		isLoading: query.isLoading,
		refetch: query.refetch,
	};
}
