"use client";

import {
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
	DropdownMenuTrigger,
} from "@ui/components/dropdown-menu";
import { Skeleton } from "@ui/components/skeleton";
import { Table, TableBody, TableCell, TableRow } from "@ui/components/table";
import {
	EyeIcon,
	MoreVerticalIcon,
	PencilIcon,
	ShieldIcon,
	TrashIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ORGANIZATION_MEMBER_ROLES } from "../../hooks/member-roles";
import {
	organizationRolesQueryOptions,
	useDeleteRoleMutation,
} from "../../hooks/use-roles";
import { ViewSystemRoleDialog } from "./ViewSystemRoleDialog";

/**
 * Loading skeleton for the roles list.
 * Used as Suspense fallback when data is being fetched.
 */
export function RolesListSkeleton() {
	return (
		<div className="rounded-md border">
			<div className="divide-y">
				{Array.from({ length: 4 }).map((_, i) => (
					<div
						key={i}
						className="flex items-center justify-between p-4"
					>
						<div className="flex items-center gap-2">
							<Skeleton className="size-4" />
							<Skeleton className="h-4 w-24" />
							<Skeleton className="h-5 w-20" />
						</div>
						<Skeleton className="size-8" />
					</div>
				))}
			</div>
		</div>
	);
}

interface RolesListProps {
	organizationId: string;
	onEditRole: (role: {
		id: string;
		name: string;
		permissions: string;
	}) => void;
}

/**
 * Roles list component using Suspense for data fetching.
 * MUST be wrapped in a Suspense boundary with RolesListSkeleton as fallback.
 */
export function RolesList({ organizationId, onEditRole }: RolesListProps) {
	const { data: customRoles } = useSuspenseQuery(
		organizationRolesQueryOptions(organizationId),
	);
	const deleteRoleMutation = useDeleteRoleMutation(organizationId);
	const systemRoleLabels = ORGANIZATION_MEMBER_ROLES;

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

	// Combine system roles with custom roles
	const allRoles = [
		...SYSTEM_ROLES.map((role) => ({
			id: role,
			name: role,
			isSystem: true,
			label: systemRoleLabels[role],
			permissions: "",
		})),
		...(customRoles?.roles || []).map((r) => ({
			id: r.id,
			name: r.role,
			isSystem: false,
			label: r.role,
			permissions: JSON.stringify(r.permission),
		})),
	];

	return (
		<div className="rounded-md border">
			<Table>
				<TableBody>
					{allRoles.map((role) => (
						<TableRow key={role.id}>
							<TableCell>
								<div className="flex items-center gap-2">
									{role.isSystem && (
										<ShieldIcon className="size-4 text-muted-foreground" />
									)}
									<span className="font-medium">
										{role.label}
									</span>
									{role.isSystem && (
										<Badge variant="secondary">
											System Role
										</Badge>
									)}
								</div>
							</TableCell>
							<TableCell className="text-right">
								{role.isSystem ? (
									<Button
										size="icon"
										variant="ghost"
										onClick={() =>
											setViewingSystemRole(
												role.name as SystemRole,
											)
										}
									>
										<EyeIcon className="size-4" />
									</Button>
								) : (
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button size="icon" variant="ghost">
												<MoreVerticalIcon className="size-4" />
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											<DropdownMenuItem
												onClick={() => onEditRole(role)}
											>
												<PencilIcon className="mr-2 size-4" />
												Edit
											</DropdownMenuItem>
											<DropdownMenuItem
												className="text-destructive"
												onClick={() =>
													handleDelete(role.name)
												}
											>
												<TrashIcon className="mr-2 size-4" />
												Delete
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								)}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>

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
