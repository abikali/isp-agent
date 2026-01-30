"use client";

import {
	getSystemRolePermissions,
	type PermissionRecord,
	type SystemRole,
} from "@repo/auth/permissions";
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
			<DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>{roleLabel} Permissions</DialogTitle>
					<DialogDescription>
						These are the default permissions for the {roleLabel}{" "}
						role. System role permissions cannot be modified.
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
