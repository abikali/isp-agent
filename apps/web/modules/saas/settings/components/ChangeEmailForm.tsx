"use client";

import { emailSchema } from "@repo/api/lib/validation";
import { authClient } from "@repo/auth/client";
import { useSession } from "@saas/auth/client";
import { SettingsItem } from "@saas/shared/client";
import { useForm, useStore } from "@tanstack/react-form";
import { Button } from "@ui/components/button";
import { Field, FieldError } from "@ui/components/field";
import { Input } from "@ui/components/input";
import { toast } from "sonner";

export function ChangeEmailForm() {
	const { user, reloadSession } = useSession();

	const form = useForm({
		defaultValues: {
			email: user?.email ?? "",
		},
		onSubmit: async ({ value }) => {
			const { error } = await authClient.changeEmail({
				newEmail: value.email,
			});

			if (error) {
				toast.error("Failed to change email");
				return;
			}

			toast.success("Email changed successfully");

			reloadSession();
		},
	});

	const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
	const isValid = useStore(form.store, (state) => state.isValid);
	const isDirty = useStore(form.store, (state) => state.isDirty);

	return (
		<SettingsItem
			title="Change Email"
			description="Update your email address"
		>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					form.handleSubmit();
				}}
			>
				<form.Field
					name="email"
					validators={{
						onChange: emailSchema,
					}}
				>
					{(field) => {
						const hasErrors =
							field.state.meta.isTouched &&
							field.state.meta.errors.length > 0;
						return (
							<Field data-invalid={hasErrors || undefined}>
								<Input
									type="email"
									value={field.state.value}
									onChange={(e) =>
										field.handleChange(e.target.value)
									}
									onBlur={field.handleBlur}
									aria-invalid={hasErrors || undefined}
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

				<div className="mt-4 flex justify-end">
					<Button
						type="submit"
						loading={isSubmitting}
						disabled={!(isValid && isDirty)}
					>
						Save
					</Button>
				</div>
			</form>
		</SettingsItem>
	);
}
