"use client";

import { authClient } from "@repo/auth/client";
import { isSystemRole } from "@repo/auth/permissions";
import { useEffect, useState } from "react";
import { useActiveOrganization } from "./use-active-organization";

interface NavigationPermissions {
	canViewOrganizationSettings: boolean;
	isLoading: boolean;
}

/**
 * Hook to determine navigation item visibility based on role permissions.
 * For system roles (owner, admin, member), permissions are determined synchronously.
 * For custom roles, async permission checks are performed.
 */
export function useNavigationPermissions(): NavigationPermissions {
	const { activeOrganization, activeOrganizationUserRole } =
		useActiveOrganization();
	const [permissions, setPermissions] = useState<NavigationPermissions>({
		canViewOrganizationSettings: false,
		isLoading: true,
	});

	useEffect(() => {
		if (!activeOrganization || !activeOrganizationUserRole) {
			setPermissions((prev) => ({ ...prev, isLoading: false }));
			return;
		}

		// System roles have known permissions - no async check needed
		if (isSystemRole(activeOrganizationUserRole)) {
			setPermissions({
				canViewOrganizationSettings:
					activeOrganizationUserRole === "owner" ||
					activeOrganizationUserRole === "admin",
				isLoading: false,
			});
			return;
		}

		// Custom role - check permissions async
		async function checkCustomRolePermissions() {
			const result = await authClient.organization.hasPermission({
				permission: { organization: ["update"] },
			});

			setPermissions({
				canViewOrganizationSettings: result.data?.success ?? false,
				isLoading: false,
			});
		}

		checkCustomRolePermissions();
	}, [activeOrganization, activeOrganizationUserRole]);

	return permissions;
}
