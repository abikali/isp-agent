"use client";

import type { PermissionRecord } from "@repo/auth/permissions";
import { useForm, useStore } from "@tanstack/react-form";
import { Button } from "@ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import { Label } from "@ui/components/label";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";
import { useUpdateRoleMutation } from "../../hooks/use-roles";
import { RolePermissionsGrid } from "./RolePermissionsGrid";

interface EditRoleDialogProps {
	organizationId: string;
	role: {
		id: string;
		name: string;
		permissions: string;
	} | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function EditRoleDialog({
	organizationId,
	role,
	open,
	onOpenChange,
}: EditRoleDialogProps) {
	const updateRoleMutation = useUpdateRoleMutation(organizationId);

	// Parse permissions from JSON string
	const parsePermissions = useCallback(
		(permissionsStr: string): PermissionRecord => {
			try {
				return JSON.parse(permissionsStr) as PermissionRecord;
			} catch {
				return {};
			}
		},
		[],
	);

	const form = useForm({
		defaultValues: {
			permissions: (role
				? parsePermissions(role.permissions)
				: {}) as Record<string, string[]>,
		},
		onSubmit: async ({ value }) => {
			if (!role) {
				return;
			}

			toast.promise(
				updateRoleMutation.mutateAsync({
					roleId: role.id,
					permissions: value.permissions as PermissionRecord,
				}),
				{
					loading: "Updating role...",
					success: () => {
						onOpenChange(false);
						return "Role updated successfully";
					},
					error: (error: { message?: string }) =>
						error?.message || "Failed to update role",
				},
			);
		},
	});

	// Reset form when role changes
	useEffect(() => {
		if (role) {
			form.reset({
				permissions: parsePermissions(role.permissions),
			});
		}
	}, [role, form, parsePermissions]);

	const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Edit Role</DialogTitle>
					<DialogDescription>
						Edit permissions for the {role?.name ?? ""} role.
					</DialogDescription>
				</DialogHeader>

				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className="space-y-6"
				>
					<form.Field name="permissions">
						{(field) => (
							<div className="space-y-2">
								<Label>Permissions</Label>
								<RolePermissionsGrid
									value={
										field.state.value as PermissionRecord
									}
									onChange={(value) =>
										field.handleChange(value)
									}
								/>
							</div>
						)}
					</form.Field>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting ? "Updating..." : "Update Role"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
