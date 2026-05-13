"use client";

import type { PermissionRecord } from "@repo/auth/permissions";
import { useForm, useStore } from "@tanstack/react-form";
import { Button } from "@ui/components/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@ui/components/sheet";
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

	useEffect(() => {
		if (role) {
			form.reset({
				permissions: parsePermissions(role.permissions),
			});
		}
	}, [role, form, parsePermissions]);

	const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				className="flex w-full flex-col gap-0 p-0 sm:max-w-3xl"
			>
				<SheetHeader className="border-b border-border px-6 py-4">
					<SheetTitle>
						Edit Role{" "}
						<span className="font-mono text-muted-foreground">
							{role?.name}
						</span>
					</SheetTitle>
					<SheetDescription>
						Update the permissions for this role. Changes apply
						immediately to all members with this role.
					</SheetDescription>
				</SheetHeader>

				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className="flex flex-1 flex-col overflow-hidden"
				>
					<div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
						<form.Field name="permissions">
							{(field) => (
								<RolePermissionsGrid
									value={
										field.state.value as PermissionRecord
									}
									onChange={(v) => field.handleChange(v)}
								/>
							)}
						</form.Field>
					</div>

					<SheetFooter className="border-t border-border bg-surface-subtle/40 px-6 py-3">
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting ? "Saving..." : "Save Changes"}
						</Button>
					</SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	);
}
