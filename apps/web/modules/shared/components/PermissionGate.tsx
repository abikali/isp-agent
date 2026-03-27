"use client";

import type { PermissionResource } from "@repo/auth/permissions";
import {
	useActiveOrganization,
	useCanAccess,
} from "@saas/organizations/client";
import type { ReactNode } from "react";

/**
 * Renders children only if the user has the required permission.
 * Shows a fallback message otherwise. Admins always pass.
 *
 * Use in route components to prevent unauthorized API calls from firing.
 */
export function PermissionGate({
	resource,
	action,
	fallback,
	children,
}: {
	resource: PermissionResource;
	action: string;
	fallback?: ReactNode;
	children: ReactNode;
}) {
	const { isOrganizationAdmin, permissions } = useActiveOrganization();
	const hasPermission = useCanAccess();

	// Still loading permissions — show nothing to avoid flash
	const permissionsLoaded =
		isOrganizationAdmin || Object.keys(permissions).length > 0;

	if (!permissionsLoaded) {
		return null;
	}

	if (isOrganizationAdmin || hasPermission(resource, action)) {
		return children;
	}

	return (
		fallback ?? (
			<div className="flex items-center justify-center min-h-[50vh] text-muted-foreground">
				You don&apos;t have permission to access this page.
			</div>
		)
	);
}
