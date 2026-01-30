"use client";

import { roleNameSchema } from "@repo/api/lib/validation";
import type { PermissionRecord } from "@repo/auth/permissions";
import { useForm, useStore } from "@tanstack/react-form";
import { Button } from "@ui/components/button";
import { Field, FieldError, FieldLabel } from "@ui/components/field";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import { toast } from "sonner";
import { useCreateRoleMutation } from "../../hooks/use-roles";
import { RolePermissionsGrid } from "./RolePermissionsGrid";

interface CreateRoleFormProps {
	organizationId: string;
	onSuccess?: () => void;
}

export function CreateRoleForm({
	organizationId,
	onSuccess,
}: CreateRoleFormProps) {
	const createRoleMutation = useCreateRoleMutation(organizationId);

	const form = useForm({
		defaultValues: {
			name: "",
			permissions: {} as Record<string, string[]>,
		},
		onSubmit: async ({ value }) => {
			toast.promise(
				createRoleMutation.mutateAsync({
					name: value.name,
					permissions: value.permissions as PermissionRecord,
				}),
				{
					loading: "Creating role...",
					success: () => {
						form.reset();
						onSuccess?.();
						return "Role created successfully";
					},
					error: (error: { message?: string }) =>
						error?.message || "Failed to create role",
				},
			);
		},
	});

	const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				form.handleSubmit();
			}}
			className="space-y-6"
		>
			<form.Field
				name="name"
				validators={{
					onBlur: roleNameSchema,
				}}
			>
				{(field) => {
					const hasErrors =
						field.state.meta.isTouched &&
						field.state.meta.errors.length > 0;
					return (
						<Field data-invalid={hasErrors || undefined}>
							<FieldLabel htmlFor="name">Role Name</FieldLabel>
							<Input
								id="name"
								placeholder="custom-role"
								value={field.state.value}
								onChange={(e) =>
									field.handleChange(e.target.value)
								}
								onBlur={field.handleBlur}
								aria-invalid={hasErrors || undefined}
							/>
							<p className="text-sm text-muted-foreground">
								Must be lowercase alphanumeric with hyphens only
							</p>
							{hasErrors && (
								<FieldError errors={field.state.meta.errors} />
							)}
						</Field>
					);
				}}
			</form.Field>

			<form.Field name="permissions">
				{(field) => (
					<div className="space-y-2">
						<Label>Permissions</Label>
						<RolePermissionsGrid
							value={field.state.value as PermissionRecord}
							onChange={(value) => field.handleChange(value)}
						/>
					</div>
				)}
			</form.Field>

			<div className="flex justify-end">
				<Button type="submit" disabled={isSubmitting}>
					{isSubmitting ? "Creating..." : "Create Role"}
				</Button>
			</div>
		</form>
	);
}
