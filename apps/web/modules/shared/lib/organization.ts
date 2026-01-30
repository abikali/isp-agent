import { useActiveOrganization } from "@saas/organizations/client";

/**
 * Hook to get the active organization ID for use in queries and mutations.
 * Returns null when no organization is active.
 *
 * @example
 * ```tsx
 * const organizationId = useOrganizationId();
 *
 * // For queries with orpc.queryOptions:
 * const query = useQuery(
 *   organizationId
 *     ? orpc.items.list.queryOptions({ input: { organizationId } })
 *     : { queryKey: ["items", "list"], enabled: false }
 * );
 *
 * // For mutations:
 * const handleSubmit = () => {
 *   if (!organizationId) return;
 *   mutation.mutate({ organizationId, ...data });
 * };
 * ```
 */
export function useOrganizationId(): string | null {
	const { activeOrganization } = useActiveOrganization();
	return activeOrganization?.id ?? null;
}

/**
 * Type assertion that organizationId is defined.
 * Use inside queryFn/mutationFn when enabled guard guarantees availability.
 *
 * @throws Error if organizationId is null/undefined (indicates a bug)
 *
 * @example
 * ```tsx
 * const organizationId = useOrganizationId();
 *
 * const query = useInfiniteQuery({
 *   queryFn: async ({ pageParam }) => {
 *     assertOrganizationId(organizationId);
 *     return api.list({ organizationId, cursor: pageParam });
 *   },
 *   enabled: !!organizationId,
 * });
 * ```
 */
export function assertOrganizationId(
	organizationId: string | null | undefined,
): asserts organizationId is string {
	if (!organizationId) {
		throw new Error(
			"Organization ID is required. " +
				"This error indicates a query or mutation ran when it should have been disabled. " +
				"Check your `enabled` condition or add a guard before calling the mutation.",
		);
	}
}

/**
 * Type guard to check if organizationId is defined.
 * Use for conditional logic where you want to silently skip operations.
 *
 * @example
 * ```tsx
 * const organizationId = useOrganizationId();
 *
 * const handleDelete = () => {
 *   if (!hasOrganizationId(organizationId)) return;
 *   // TypeScript now knows organizationId is string
 *   deleteMutation.mutate({ organizationId, id: itemId });
 * };
 * ```
 */
export function hasOrganizationId(
	organizationId: string | null | undefined,
): organizationId is string {
	return typeof organizationId === "string" && organizationId.length > 0;
}

/**
 * Creates a disabled query configuration for use when organizationId is not available.
 * Use with the ternary pattern to avoid constructing invalid query inputs.
 *
 * @example
 * ```tsx
 * const organizationId = useOrganizationId();
 *
 * const query = useQuery(
 *   organizationId
 *     ? orpc.items.list.queryOptions({ input: { organizationId } })
 *     : disabledQuery(["items", "list"])
 * );
 * ```
 */
export function disabledQuery(queryKey: readonly unknown[]) {
	return {
		queryKey,
		queryFn: (): undefined => undefined,
		enabled: false as const,
	};
}

/**
 * Creates a disabled infinite query configuration for use when organizationId is not available.
 * Use with the ternary pattern to avoid constructing invalid infinite query inputs.
 *
 * @param queryKey - The query key for cache identification
 * @param emptyData - The empty data structure to return (required to ensure type safety)
 *
 * @example
 * ```tsx
 * const organizationId = useOrganizationId();
 *
 * const query = useInfiniteQuery(
 *   organizationId
 *     ? orpc.items.list.infiniteOptions({ input: { organizationId } })
 *     : disabledInfiniteQuery(["items", "list"], { items: [], nextCursor: undefined })
 * );
 * ```
 */
export function disabledInfiniteQuery<TData, TPageParam = string | undefined>(
	queryKey: readonly string[],
	emptyData: TData,
) {
	return {
		queryKey,
		queryFn: () => Promise.resolve(emptyData),
		initialPageParam: undefined as TPageParam,
		getNextPageParam: () => undefined,
		enabled: false as const,
	};
}
