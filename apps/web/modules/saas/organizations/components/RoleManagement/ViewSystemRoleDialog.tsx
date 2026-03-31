"use client";

import {
	getSystemRolePermissions,
	type PermissionRecord,
	type SystemRole,
} from "@repo/auth/permissions";
import { Badge } from "@ui/components/badge";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import { useMemo } from "react";
import { ORGANIZATION_MEMBER_ROLES } from "../../hooks/member-roles";
import { RolePermissionsGrid } from "./RolePermissionsGrid";

interface ViewSystemRoleDialogProps {
	role: SystemRole | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function ViewSystemRoleDialog({
	role,
	open,
	onOpenChange,
}: ViewSystemRoleDialogProps) {
	const permissions = useMemo(() => {
		if (!role) {
			return {};
		}
		return getSystemRolePermissions(role);
	}, [role]);

	const roleLabel = role ? ORGANIZATION_MEMBER_ROLES[role] : "";

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] w-full max-w-3xl overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						{roleLabel} Permissions
						<Badge variant="secondary" className="text-[10px]">
							System Role
						</Badge>
					</DialogTitle>
					<DialogDescription>
						System role permissions are built-in and cannot be
						modified. Create a custom role if you need different
						permissions.
					</DialogDescription>
				</DialogHeader>

				<RolePermissionsGrid
					value={permissions as PermissionRecord}
					onChange={() => {}}
					disabled
				/>
			</DialogContent>
		</Dialog>
	);
}
