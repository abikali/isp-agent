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
