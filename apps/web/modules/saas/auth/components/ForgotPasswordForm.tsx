"use client";

import { emailSchema } from "@repo/api/lib/validation";
import { authClient } from "@repo/auth/client";
import { getAuthErrorMessage } from "@saas/auth/client";
import { useForm, useStore } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { Alert, AlertDescription, AlertTitle } from "@ui/components/alert";
import { Button } from "@ui/components/button";
import { Field, FieldError, FieldLabel } from "@ui/components/field";
import { Input } from "@ui/components/input";
import { AlertTriangleIcon, ArrowLeftIcon, MailboxIcon } from "lucide-react";
import { useState } from "react";

export function ForgotPasswordForm() {
	const [rootError, setRootError] = useState<string | null>(null);
	const [isSuccess, setIsSuccess] = useState(false);

	const form = useForm({
		defaultValues: {
			email: "",
		},
		onSubmit: async ({ value }) => {
			setRootError(null);
			try {
				const redirectTo = new URL(
					"/reset-password",
					window.location.origin,
				).toString();

				const { error } = await authClient.requestPasswordReset({
					email: value.email,
					redirectTo,
				});

				if (error) {
					throw error;
				}

				setIsSuccess(true);
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
				Forgot your password?
			</h1>
			<p className="mt-1 mb-6 text-foreground/60">
				Enter your email and we'll send you a link to reset your
				password
			</p>

			{isSuccess ? (
				<Alert variant="success">
					<MailboxIcon />
					<AlertTitle>Check your email</AlertTitle>
					<AlertDescription>
						We've sent you a password reset link
					</AlertDescription>
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
								<Field data-invalid={hasErrors || undefined}>
									<FieldLabel htmlFor="email">
										Email
									</FieldLabel>
									<Input
										id="email"
										type="email"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
										onBlur={field.handleBlur}
										autoComplete="email"
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

					<Button loading={isSubmitting}>Send reset link</Button>
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
