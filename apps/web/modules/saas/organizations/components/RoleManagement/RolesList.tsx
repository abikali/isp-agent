"use client";

import {
	getSystemRolePermissions,
	isSystemRole,
	SYSTEM_ROLES,
	type SystemRole,
} from "@repo/auth/permissions";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@ui/components/dropdown-menu";
import { Skeleton } from "@ui/components/skeleton";
import {
	CrownIcon,
	EyeIcon,
	MoreVerticalIcon,
	PencilIcon,
	ShieldCheckIcon,
	ShieldIcon,
	TrashIcon,
	UserIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ORGANIZATION_MEMBER_ROLES } from "../../hooks/member-roles";
import {
	organizationRolesQueryOptions,
	useDeleteRoleMutation,
} from "../../hooks/use-roles";
import { ViewSystemRoleDialog } from "./ViewSystemRoleDialog";

export function RolesListSkeleton() {
	return (
		<div className="space-y-2">
			{Array.from({ length: 4 }).map((_, i) => (
				<div
					key={i}
					className="flex items-center justify-between rounded-lg border p-4"
				>
					<div className="flex items-center gap-3">
						<Skeleton className="size-9 rounded-lg" />
						<div className="space-y-1.5">
							<Skeleton className="h-4 w-24" />
							<Skeleton className="h-3 w-40" />
						</div>
					</div>
					<Skeleton className="size-8" />
				</div>
			))}
		</div>
	);
}

const SYSTEM_ROLE_ICONS: Record<SystemRole, typeof ShieldIcon> = {
	owner: CrownIcon,
	admin: ShieldCheckIcon,
	member: UserIcon,
};

const SYSTEM_ROLE_DESCRIPTIONS: Record<SystemRole, string> = {
	owner: "Full access to everything including organization deletion",
	admin: "Full access except organization deletion",
	member: "Read-only access to most resources",
};

function countActions(perms: Record<string, unknown>): number {
	return Object.values(perms).reduce(
		(sum: number, actions) =>
			sum + (Array.isArray(actions) ? actions.length : 0),
		0,
	);
}

function getPermissionCount(permissions: string): number {
	try {
		return countActions(JSON.parse(permissions));
	} catch {
		return 0;
	}
}

function getSystemPermissionCount(role: SystemRole): number {
	return countActions(getSystemRolePermissions(role));
}

interface RolesListProps {
	organizationId: string;
	onEditRole: (role: {
		id: string;
		name: string;
		permissions: string;
	}) => void;
}

export function RolesList({ organizationId, onEditRole }: RolesListProps) {
	const { data: customRoles } = useSuspenseQuery(
		organizationRolesQueryOptions(organizationId),
	);
	const deleteRoleMutation = useDeleteRoleMutation(organizationId);

	const [viewingSystemRole, setViewingSystemRole] =
		useState<SystemRole | null>(null);

	const handleDelete = async (roleName: string) => {
		if (isSystemRole(roleName)) {
			toast.error("Cannot delete system roles");
			return;
		}

		toast.promise(deleteRoleMutation.mutateAsync(roleName), {
			loading: "Deleting role...",
			success: "Role deleted successfully",
			error: (error: { message?: string }) =>
				error?.message || "Failed to delete role",
		});
	};

	const customRolesList = (customRoles?.roles || []).map((r) => ({
		id: r.id,
		name: r.role,
		permissions: JSON.stringify(r.permission),
	}));

	return (
		<div className="space-y-4">
			{/* System roles */}
			<div>
				<p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
					System Roles
				</p>
				<div className="space-y-2">
					{SYSTEM_ROLES.map((role) => {
						const Icon = SYSTEM_ROLE_ICONS[role];
						const permCount = getSystemPermissionCount(role);
						return (
							<div
								key={role}
								className="group flex items-center justify-between gap-2 rounded-lg border bg-card p-3 sm:p-4 transition-colors hover:bg-accent/50"
							>
								<div className="flex items-center gap-3 min-w-0">
									<div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
										<Icon className="size-4 text-muted-foreground" />
									</div>
									<div className="min-w-0">
										<div className="flex items-center gap-2">
											<span className="text-sm font-medium">
												{
													ORGANIZATION_MEMBER_ROLES[
														role
													]
												}
											</span>
											<Badge
												variant="secondary"
												className="text-[10px] px-1.5 py-0"
											>
												System
											</Badge>
										</div>
										<p className="text-xs text-muted-foreground truncate">
											{SYSTEM_ROLE_DESCRIPTIONS[role]}
										</p>
									</div>
								</div>
								<div className="flex items-center gap-2">
									<span className="hidden text-xs text-muted-foreground sm:inline">
										{permCount} permissions
									</span>
									<Button
										size="icon"
										variant="ghost"
										className="size-8"
										onClick={() =>
											setViewingSystemRole(role)
										}
									>
										<EyeIcon className="size-3.5" />
									</Button>
								</div>
							</div>
						);
					})}
				</div>
			</div>

			{/* Custom roles */}
			{customRolesList.length > 0 && (
				<div>
					<p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
						Custom Roles
					</p>
					<div className="space-y-2">
						{customRolesList.map((role) => {
							const permCount = getPermissionCount(
								role.permissions,
							);
							return (
								<div
									key={role.id}
									className="group flex items-center justify-between gap-2 rounded-lg border bg-card p-3 sm:p-4 transition-colors hover:bg-accent/50"
								>
									<div className="flex items-center gap-3 min-w-0">
										<div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
											<ShieldIcon className="size-4 text-primary" />
										</div>
										<div className="min-w-0">
											<span className="text-sm font-medium block truncate">
												{role.name}
											</span>
											<p className="text-xs text-muted-foreground">
												{permCount} permissions
												configured
											</p>
										</div>
									</div>
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button
												size="icon"
												variant="ghost"
												className="size-8"
											>
												<MoreVerticalIcon className="size-3.5" />
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											<DropdownMenuItem
												onClick={() => onEditRole(role)}
											>
												<PencilIcon className="mr-2 size-3.5" />
												Edit Permissions
											</DropdownMenuItem>
											<DropdownMenuSeparator />
											<DropdownMenuItem
												className="text-destructive"
												onClick={() =>
													handleDelete(role.name)
												}
											>
												<TrashIcon className="mr-2 size-3.5" />
												Delete Role
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</div>
							);
						})}
					</div>
				</div>
			)}

			<ViewSystemRoleDialog
				role={viewingSystemRole}
				open={viewingSystemRole !== null}
				onOpenChange={(open) => {
					if (!open) {
						setViewingSystemRole(null);
					}
				}}
			/>
		</div>
	);
}
