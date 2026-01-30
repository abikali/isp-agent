"use client";

import { passwordLoginSchema, passwordSchema } from "@repo/api/lib/validation";
import { authClient } from "@repo/auth/client";
import { SettingsItem } from "@saas/shared/client";
import { useRouter } from "@shared/hooks/router";
import { useForm, useStore } from "@tanstack/react-form";
import { Button } from "@ui/components/button";
import { Field, FieldError, FieldLabel } from "@ui/components/field";
import { PasswordInput } from "@ui/components/password-input";
import { toast } from "sonner";

export function ChangePasswordForm() {
	const router = useRouter();

	const form = useForm({
		defaultValues: {
			currentPassword: "",
			newPassword: "",
		},
		onSubmit: async ({ value }) => {
			const { error } = await authClient.changePassword({
				currentPassword: value.currentPassword,
				newPassword: value.newPassword,
				revokeOtherSessions: true,
			});

			if (error) {
				toast.error("Failed to change password");

				return;
			}

			toast.success("Password changed successfully");
			form.reset();
			router.refresh();
		},
	});

	const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
	const isValid = useStore(form.store, (state) => state.isValid);
	const isDirty = useStore(form.store, (state) => state.isDirty);

	return (
		<SettingsItem title="Change Password">
			<form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					form.handleSubmit();
				}}
			>
				<div className="grid grid-cols-1 gap-4">
					<form.Field
						name="currentPassword"
						validators={{
							onChange: passwordLoginSchema,
						}}
					>
						{(field) => {
							const hasErrors =
								field.state.meta.isTouched &&
								field.state.meta.errors.length > 0;
							return (
								<Field data-invalid={hasErrors || undefined}>
									<FieldLabel htmlFor="currentPassword">
										Current Password
									</FieldLabel>
									<PasswordInput
										autoComplete="current-password"
										value={field.state.value}
										onChange={(value) =>
											field.handleChange(value)
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

					<form.Field
						name="newPassword"
						validators={{
							onChange: passwordSchema,
						}}
					>
						{(field) => {
							const hasErrors =
								field.state.meta.isTouched &&
								field.state.meta.errors.length > 0;
							return (
								<Field data-invalid={hasErrors || undefined}>
									<FieldLabel htmlFor="newPassword">
										New Password
									</FieldLabel>
									<PasswordInput
										autoComplete="new-password"
										value={field.state.value}
										onChange={(value) =>
											field.handleChange(value)
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

					<div className="flex justify-end">
						<Button
							type="submit"
							loading={isSubmitting}
							disabled={!(isValid && isDirty)}
						>
							Save
						</Button>
					</div>
				</div>
			</form>
		</SettingsItem>
	);
}
