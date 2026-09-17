import type { PermissionResource } from "@repo/auth/permissions";
import { hasPermission, type PermissionContext } from "../../../lib/permission";

export const SEARCH_TYPES = [
	"customer",
	"employee",
	"task",
	"conversation",
	"broadcast",
] as const;

export type SearchType = (typeof SEARCH_TYPES)[number];

/** The permission each palette section needs — the same one its list page checks. */
export const SEARCH_TYPE_RESOURCE: Record<SearchType, PermissionResource> = {
	customer: "customers",
	employee: "employees",
	task: "tasks",
	conversation: "aiAgents",
	broadcast: "marketing",
};

/**
 * The requested search types the caller may read. Types without `read`
 * permission are dropped silently, so the palette just shows fewer groups
 * instead of failing the whole search.
 */
export function allowedSearchTypes(
	permCtx: PermissionContext,
	requested: readonly SearchType[] = SEARCH_TYPES,
): Set<SearchType> {
	return new Set(
		requested.filter((type) =>
			hasPermission(permCtx, SEARCH_TYPE_RESOURCE[type], "read"),
		),
	);
}
