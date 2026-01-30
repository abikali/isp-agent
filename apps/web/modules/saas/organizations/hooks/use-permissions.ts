"use client";

import { authClient } from "@repo/auth/client";
import type { PermissionRecord } from "@repo/auth/permissions";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Hook to check if the current user has specific permissions.
 * Uses the async hasPermission API for dynamic role support.
 */
export function useHasPermission(permissions: PermissionRecord) {
	const [hasPermission, setHasPermission] = useState<boolean | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	// Use ref to track previous permissions and avoid unnecessary re-runs
	const permissionsRef = useRef<string>("");
	const currentKey = JSON.stringify(permissions);

	useEffect(() => {
		// Skip if permissions haven't changed
		if (permissionsRef.current === currentKey) {
			return;
		}
		permissionsRef.current = currentKey;

		let mounted = true;

		async function checkPermission() {
			try {
				const result = await authClient.organization.hasPermission({
					permission: permissions,
				});
				if (mounted) {
					// better-auth returns { data, error } structure
					// data contains the permission result
					setHasPermission(result.data?.success ?? false);
				}
			} catch {
				if (mounted) {
					setHasPermission(false);
				}
			} finally {
				if (mounted) {
					setIsLoading(false);
				}
			}
		}

		checkPermission();

		return () => {
			mounted = false;
		};
	}, [permissions, currentKey]);

	return { hasPermission, isLoading };
}

/**
 * Hook to get a permission checking function.
 * Returns an async function to check permissions on demand.
 */
export function usePermissionChecker() {
	const checkPermission = useCallback(
		async (permissions: PermissionRecord): Promise<boolean> => {
			try {
				const result = await authClient.organization.hasPermission({
					permission: permissions,
				});
				return result.data?.success ?? false;
			} catch {
				return false;
			}
		},
		[],
	);

	return { checkPermission };
}

/**
 * Synchronous permission check for static roles.
 * Only works for the predefined system roles (owner, admin, member).
 * For custom/dynamic roles, use useHasPermission instead.
 */
export function useCheckRolePermission(_role: "admin" | "member" | "owner") {
	const checkRolePermission = useCallback(
		async (permissions: PermissionRecord): Promise<boolean> => {
			try {
				const result = await authClient.organization.hasPermission({
					permission: permissions,
				});
				return result.data?.success ?? false;
			} catch {
				return false;
			}
		},
		[],
	);

	return { checkRolePermission };
}
