"use client";

import { nameSchema } from "@repo/api/lib/validation";
import { authClient } from "@repo/auth/client";
import { useSession } from "@saas/auth/client";
import { UserAvatarUpload } from "@saas/settings/client";
import { useForm, useStore } from "@tanstack/react-form";
import { Button } from "@ui/components/button";
import { Field, FieldError, FieldLabel } from "@ui/components/field";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import { ArrowRightIcon } from "lucide-react";
import { useEffect, useState } from "react";

export function OnboardingStep1({ onCompleted }: { onCompleted: () => void }) {
	const { user } = useSession();
	const [rootError, setRootError] = useState<string | null>(null);

	const form = useForm({
		defaultValues: {
			name: user?.name ?? "",
		},
		onSubmit: async ({ value }) => {
			setRootError(null);

			try {
				await authClient.updateUser({
					name: value.name,
					onboardingComplete: true,
				});

				onCompleted();
			} catch {
				setRootError(
					"Failed to set up your account. Please try again.",
				);
			}
		},
	});

	useEffect(() => {
		if (user) {
			form.setFieldValue("name", user.name ?? "");
		}
	}, [user, form]);

	const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

	return (
		<div>
			<form
				className="flex flex-col items-stretch gap-8"
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					form.handleSubmit();
				}}
			>
				{rootError && (
					<p className="text-sm text-destructive">{rootError}</p>
				)}

				<form.Field
					name="name"
					validators={{
						onBlur: nameSchema,
					}}
				>
					{(field) => {
						const hasErrors =
							field.state.meta.isTouched &&
							field.state.meta.errors.length > 0;
						return (
							<Field data-invalid={hasErrors || undefined}>
								<FieldLabel htmlFor="name">
									Your name
								</FieldLabel>
								<Input
									id="name"
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

				<div className="flex items-center justify-between gap-4">
					<div>
						<Label>Avatar</Label>
						<p className="text-sm text-muted-foreground">
							Upload a profile picture
						</p>
					</div>
					<UserAvatarUpload
						onSuccess={() => {
							return;
						}}
						onError={() => {
							return;
						}}
					/>
				</div>

				<Button type="submit" loading={isSubmitting}>
					Continue
					<ArrowRightIcon className="ml-2 size-4" />
				</Button>
			</form>
		</div>
	);
}
