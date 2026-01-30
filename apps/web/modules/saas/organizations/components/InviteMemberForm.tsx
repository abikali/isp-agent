"use client";

import { emailSchema } from "@repo/api/lib/validation";
import { authClient } from "@repo/auth/client";
import { organizationsQueryKeys } from "@saas/organizations/lib/api";
import { SettingsItem } from "@saas/shared/client";
import { useForm, useStore } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@ui/components/button";
import { Field, FieldError, FieldLabel } from "@ui/components/field";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import { toast } from "sonner";
import { OrganizationRoleSelect } from "./OrganizationRoleSelect";

export function InviteMemberForm({
	organizationId,
}: {
	organizationId: string;
}) {
	const queryClient = useQueryClient();

	const form = useForm({
		defaultValues: {
			email: "",
			role: "member" as string,
		},
		onSubmit: async ({ value }) => {
			const { error } = await authClient.organization.inviteMember({
				email: value.email,
				// Cast to expected type - Better Auth accepts custom role names at runtime
				role: value.role as "member" | "admin" | "owner",
				organizationId,
			});

			if (error) {
				toast.error(error.message || "Failed to send invitation");
				return;
			}

			form.reset();

			queryClient.invalidateQueries({
				queryKey: organizationsQueryKeys.detail(organizationId),
			});

			toast.success("Invitation sent successfully");
		},
	});

	const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

	return (
		<SettingsItem
			title="Invite Member"
			description="Send an invitation to join this organization."
		>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					form.handleSubmit();
				}}
				className="@container"
			>
				<div className="flex @md:flex-row flex-col gap-2">
					<div className="flex-1">
						<form.Field
							name="email"
							validators={{
								onBlur: emailSchema,
							}}
						>
							{(field) => {
								const hasErrors =
									field.state.meta.isTouched &&
									field.state.meta.errors.length > 0;
								return (
									<Field
										data-invalid={hasErrors || undefined}
									>
										<FieldLabel htmlFor="email">
											Email
										</FieldLabel>
										<Input
											id="email"
											type="email"
											value={field.state.value}
											onChange={(e) =>
												field.handleChange(
													e.target.value,
												)
											}
											onBlur={field.handleBlur}
											aria-invalid={
												hasErrors || undefined
											}
										/>
										{hasErrors && (
											<FieldError
												errors={field.state.meta.errors}
											/>
										)}
									</Field>
								);
							}}
						</form.Field>
					</div>

					<div>
						<form.Field name="role">
							{(field) => (
								<div className="space-y-2">
									<Label>Role</Label>
									<OrganizationRoleSelect
										value={field.state.value}
										onSelect={(value) =>
											field.handleChange(value)
										}
										organizationId={organizationId}
									/>
								</div>
							)}
						</form.Field>
					</div>
				</div>

				<div className="mt-4 flex justify-end">
					<Button type="submit" loading={isSubmitting}>
						Send Invitation
					</Button>
				</div>
			</form>
		</SettingsItem>
	);
}
