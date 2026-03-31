"use client";

import { roleNameSchema } from "@repo/api/lib/validation";
import type { PermissionRecord } from "@repo/auth/permissions";
import { ISP_ROLE_TEMPLATES } from "@repo/auth/permissions";
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
import { Field, FieldError, FieldLabel } from "@ui/components/field";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import { Separator } from "@ui/components/separator";
import { toast } from "sonner";
import { useCreateRoleMutation } from "../../hooks/use-roles";
import { RolePermissionsGrid } from "./RolePermissionsGrid";

interface CreateRoleDialogProps {
	organizationId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function CreateRoleDialog({
	organizationId,
	open,
	onOpenChange,
}: CreateRoleDialogProps) {
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
						onOpenChange(false);
						return "Role created successfully";
					},
					error: (error: { message?: string }) =>
						error?.message || "Failed to create role",
				},
			);
		},
	});

	const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

	const applyTemplate = (templateKey: keyof typeof ISP_ROLE_TEMPLATES) => {
		const template = ISP_ROLE_TEMPLATES[templateKey];
		if (template) {
			// Deep-copy readonly template arrays to mutable
			const perms: Record<string, string[]> = {};
			for (const [key, actions] of Object.entries(template.permissions)) {
				perms[key] = [...actions];
			}
			form.setFieldValue("permissions", perms);
			if (!form.getFieldValue("name")) {
				form.setFieldValue("name", templateKey.replace(/_/g, "-"));
			}
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] w-full max-w-3xl overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Create Custom Role</DialogTitle>
					<DialogDescription>
						Define a new role with specific permissions. You can
						start from a template or build from scratch.
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
									<FieldLabel htmlFor="role-name">
										Role Name
									</FieldLabel>
									<Input
										id="role-name"
										placeholder="e.g. collector, field-tech, dealer"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
										onBlur={field.handleBlur}
										aria-invalid={hasErrors || undefined}
									/>
									<p className="text-xs text-muted-foreground">
										Lowercase letters, numbers, and hyphens
										only
									</p>
									{hasErrors && (
										<FieldError
											errors={field.state.meta.errors}
										/>
									)}
								</Field>
							);
						}}
					</form.Field>

					{/* Quick templates */}
					<div className="space-y-2">
						<Label className="text-xs text-muted-foreground">
							Start from a template
						</Label>
						<div className="flex flex-wrap gap-2">
							{Object.entries(ISP_ROLE_TEMPLATES).map(
								([key, template]) => (
									<button
										key={key}
										type="button"
										onClick={() =>
											applyTemplate(
												key as keyof typeof ISP_ROLE_TEMPLATES,
											)
										}
										className="group flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:bg-accent"
									>
										<div>
											<span className="text-xs font-medium">
												{template.label}
											</span>
											<p className="text-[10px] text-muted-foreground">
												{template.description}
											</p>
										</div>
									</button>
								),
							)}
						</div>
					</div>

					<Separator />

					<form.Field name="permissions">
						{(field) => (
							<div className="space-y-2">
								<Label>Permissions</Label>
								<RolePermissionsGrid
									value={
										field.state.value as PermissionRecord
									}
									onChange={(v) => field.handleChange(v)}
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
							{isSubmitting ? "Creating..." : "Create Role"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
