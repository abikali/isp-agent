"use client";

import { authClient } from "@repo/auth/client";
import { config } from "@repo/config";
import { getAuthErrorMessage } from "@saas/auth/client";
import { useRouter } from "@shared/hooks/router";
import { useForm, useStore } from "@tanstack/react-form";
import { Link, useSearch } from "@tanstack/react-router";
import { Alert, AlertTitle } from "@ui/components/alert";
import { Button } from "@ui/components/button";
import { Field, FieldError, FieldLabel } from "@ui/components/field";
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSeparator,
	InputOTPSlot,
} from "@ui/components/input-otp";
import { AlertTriangleIcon, ArrowLeftIcon } from "lucide-react";
import { useState } from "react";

export function OtpForm() {
	const router = useRouter();
	const searchParams = useSearch({ strict: false }) as {
		invitationId?: string;
		redirectTo?: string;
	};

	const invitationId = searchParams.invitationId;
	const redirectTo = searchParams.redirectTo;

	const redirectPath = invitationId
		? `/organization-invitation/${invitationId}`
		: (redirectTo ?? config.auth.redirectAfterSignIn);

	const [rootError, setRootError] = useState<string | null>(null);

	const form = useForm({
		defaultValues: {
			code: "",
		},
		onSubmit: async ({ value }) => {
			setRootError(null);
			try {
				const { error } = await authClient.twoFactor.verifyTotp({
					code: value.code,
				});

				if (error) {
					throw error;
				}

				router.replace(redirectPath);
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
				Two-factor authentication
			</h1>
			<p className="mt-1 mb-4 text-foreground/60">
				Enter the verification code from your authenticator app
			</p>

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
					name="code"
					validators={{
						// Inline validator for specific UX: only error on partial input (1-5 digits)
						// Empty and complete (6 digits) are valid states during typing
						onChange: ({ value }) =>
							value.length > 0 && value.length < 6
								? "Code must be 6 digits"
								: undefined,
					}}
				>
					{(field) => {
						const hasErrors = field.state.meta.errors.length > 0;
						return (
							<Field data-invalid={hasErrors || undefined}>
								<FieldLabel htmlFor="code">
									Verification code
								</FieldLabel>
								<InputOTP
									maxLength={6}
									value={field.state.value}
									onChange={(value) => {
										field.handleChange(value);
										// Auto-submit when 6 digits entered
										if (value.length === 6) {
											form.handleSubmit();
										}
									}}
									autoComplete="one-time-code"
								>
									<InputOTPGroup>
										<InputOTPSlot
											className="size-10 text-lg"
											index={0}
										/>
										<InputOTPSlot
											className="size-10 text-lg"
											index={1}
										/>
										<InputOTPSlot
											className="size-10 text-lg"
											index={2}
										/>
									</InputOTPGroup>
									<InputOTPSeparator className="opacity-40" />
									<InputOTPGroup>
										<InputOTPSlot
											className="size-10 text-lg"
											index={3}
										/>
										<InputOTPSlot
											className="size-10 text-lg"
											index={4}
										/>
										<InputOTPSlot
											className="size-10 text-lg"
											index={5}
										/>
									</InputOTPGroup>
								</InputOTP>
								{hasErrors && (
									<FieldError
										errors={field.state.meta.errors}
									/>
								)}
							</Field>
						);
					}}
				</form.Field>

				<Button loading={isSubmitting}>Verify</Button>
			</form>

			<div className="mt-6 text-center text-sm">
				<Link to="/login">
					<ArrowLeftIcon className="mr-1 inline size-4 align-middle" />
					Back to sign in
				</Link>
			</div>
		</>
	);
}
