"use client";

import type { PermissionResource } from "@repo/auth/permissions";
import { useCallback, useContext } from "react";
import { ActiveOrganizationContext } from "../lib/active-organization-context";

export const useActiveOrganization = () => {
	const activeOrganizationContext = useContext(ActiveOrganizationContext);

	type ActiveOrganizationContextType = NonNullable<
		typeof activeOrganizationContext
	>;

	if (activeOrganizationContext === undefined) {
		return {
			activeOrganization: null,
			setActiveOrganization: () => Promise.resolve(),
			refetchActiveOrganization: () => Promise.resolve(),
			activeOrganizationUserRole: null,
			isOrganizationAdmin: false,
			permissions: {},
			employee: null,
			dealer: null,
			loaded: true,
		} satisfies ActiveOrganizationContextType;
	}

	return activeOrganizationContext;
};

/**
 * Check if the current user has a specific permission (base action, ignoring scope).
 * Synchronous — uses pre-fetched permissions from context. No API calls.
 * Use for UI visibility gating — API-level scope enforcement still applies.
 */
export function useCanAccess() {
	const { permissions } = useActiveOrganization();

	return useCallback(
		(resource: PermissionResource, action: string): boolean => {
			const actions = permissions[resource];
			if (!actions) {
				return false;
			}
			return actions.some((a) => {
				const baseAction = a.endsWith(":own") ? a.slice(0, -4) : a;
				return baseAction === action;
			});
		},
		[permissions],
	);
}

/**
 * Returns the scope of a permission: "all", "own", or null (no access).
 * Use when the UI needs to distinguish between full access and own-only access
 * (e.g., showing "All Customers" vs "My Customers" in NavBar).
 */
export function usePermissionScope() {
	const { permissions } = useActiveOrganization();

	return useCallback(
		(
			resource: PermissionResource,
			action: string,
		): "all" | "own" | null => {
			const actions = permissions[resource];
			if (!actions) {
				return null;
			}
			// Check for exact match first (full access)
			if (actions.includes(action)) {
				return "all";
			}
			// Check for scoped match (own-only access)
			if (actions.includes(`${action}:own`)) {
				return "own";
			}
			return null;
		},
		[permissions],
	);
}
