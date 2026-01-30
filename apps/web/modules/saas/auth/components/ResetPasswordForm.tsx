"use client";

import { passwordSchema } from "@repo/api/lib/validation";
import { authClient } from "@repo/auth/client";
import { config } from "@repo/config";
import { getAuthErrorMessage, useSession } from "@saas/auth/client";
import { useRouter } from "@shared/hooks/router";
import { useForm, useStore } from "@tanstack/react-form";
import { Link, useSearch } from "@tanstack/react-router";
import { Alert, AlertTitle } from "@ui/components/alert";
import { Button } from "@ui/components/button";
import { Field, FieldError, FieldLabel } from "@ui/components/field";
import { PasswordInput } from "@ui/components/password-input";
import { AlertTriangleIcon, ArrowLeftIcon, MailboxIcon } from "lucide-react";
import { useState } from "react";

export function ResetPasswordForm() {
	const { user } = useSession();
	const router = useRouter();
	const searchParams = useSearch({ strict: false }) as { token?: string };
	const token = searchParams.token;

	const [rootError, setRootError] = useState<string | null>(null);
	const [isSuccess, setIsSuccess] = useState(false);

	const form = useForm({
		defaultValues: {
			password: "",
			confirmPassword: "",
		},
		onSubmit: async ({ value }) => {
			setRootError(null);
			try {
				const { error } = await authClient.resetPassword({
					token: token ?? undefined,
					newPassword: value.password,
				});

				if (error) {
					throw error;
				}

				setIsSuccess(true);

				if (user) {
					router.push(config.auth.redirectAfterSignIn);
				}
			} catch (e) {
				setRootError(
					getAuthErrorMessage(
						e && typeof e === "object" && "code" in e
							? (e.code as string)
							: undefined,
					),
				);
			}
		},
	});

	const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

	return (
		<>
			<h1 className="font-bold text-xl md:text-2xl">
				Reset your password
			</h1>
			<p className="mt-1 mb-6 text-foreground/60">
				Enter your new password below
			</p>

			{isSuccess ? (
				<Alert variant="success">
					<MailboxIcon />
					<AlertTitle>Password reset successfully</AlertTitle>
				</Alert>
			) : (
				<form
					className="flex flex-col items-stretch gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
				>
					{rootError && (
						<Alert variant="error">
							<AlertTriangleIcon />
							<AlertTitle>{rootError}</AlertTitle>
						</Alert>
					)}

					<form.Field
						name="password"
						validators={{
							onBlur: passwordSchema,
						}}
					>
						{(field) => {
							const hasErrors =
								field.state.meta.isTouched &&
								field.state.meta.errors.length > 0;
							return (
								<Field data-invalid={hasErrors || undefined}>
									<FieldLabel htmlFor="password">
										New password
									</FieldLabel>
									<PasswordInput
										value={field.state.value}
										onChange={(value) =>
											field.handleChange(value)
										}
										autoComplete="new-password"
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
						name="confirmPassword"
						validators={{
							onBlur: ({ value, fieldApi }) => {
								if (!value) {
									return "Please confirm your password";
								}
								if (
									value !==
									fieldApi.form.getFieldValue("password")
								) {
									return "Passwords do not match";
								}
								return undefined;
							},
						}}
					>
						{(field) => {
							const hasErrors =
								field.state.meta.isTouched &&
								field.state.meta.errors.length > 0;
							return (
								<Field data-invalid={hasErrors || undefined}>
									<FieldLabel htmlFor="confirmPassword">
										Confirm password
									</FieldLabel>
									<PasswordInput
										value={field.state.value}
										onChange={(value) =>
											field.handleChange(value)
										}
										autoComplete="new-password"
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

					<Button loading={isSubmitting}>Reset password</Button>
				</form>
			)}

			<div className="mt-6 text-center text-sm">
				<Link to="/login">
					<ArrowLeftIcon className="mr-1 inline size-4 align-middle" />
					Back to sign in
				</Link>
			</div>
		</>
	);
}
