"use client";

import {
	emailSchema,
	nameSchema,
	passwordSchema,
} from "@repo/api/lib/validation";
import { authClient } from "@repo/auth/client";
import { config } from "@repo/config";
import { getAuthErrorMessage } from "@saas/auth/client";
import { OrganizationInvitationAlert } from "@saas/organizations/client";
import { useRouter } from "@shared/hooks/router";
import { orpcClient } from "@shared/lib/orpc";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { Link, useSearch } from "@tanstack/react-router";
import { Alert, AlertDescription, AlertTitle } from "@ui/components/alert";
import { Button } from "@ui/components/button";
import { Field, FieldError, FieldLabel } from "@ui/components/field";
import { Input } from "@ui/components/input";
import {
	AlertTriangleIcon,
	ArrowRightIcon,
	EyeIcon,
	EyeOffIcon,
	MailboxIcon,
} from "lucide-react";
import { useState } from "react";
import {
	type OAuthProvider,
	oAuthProviders,
} from "../constants/oauth-providers";
import { SocialSigninButton } from "./SocialSigninButton";

export function SignupForm({ prefillEmail }: { prefillEmail?: string }) {
	const router = useRouter();
	const searchParams = useSearch({ strict: false }) as {
		invitationId?: string;
		email?: string;
		redirectTo?: string;
	};

	const [showPassword, setShowPassword] = useState(false);
	const [rootError, setRootError] = useState<string | null>(null);
	const [isSuccess, setIsSuccess] = useState(false);
	const [showResendOption, setShowResendOption] = useState(false);
	const [emailToResend, setEmailToResend] = useState<string | null>(null);
	const invitationId = searchParams.invitationId;
	const email = searchParams.email;
	const redirectTo = searchParams.redirectTo;

	const invitationOnlyMode = !config.auth.enableSignup && invitationId;

	const redirectPath = invitationId
		? `/organization-invitation/${invitationId}`
		: (redirectTo ?? config.auth.redirectAfterSignIn);

	const form = useForm({
		defaultValues: {
			name: "",
			email: prefillEmail ?? email ?? "",
			password: "",
			confirmPassword: "",
		},
		onSubmit: async ({ value }) => {
			setRootError(null);
			try {
				const { error } = await (config.auth.enablePasswordLogin
					? await authClient.signUp.email({
							email: value.email,
							password: value.password,
							name: value.name,
							callbackURL: redirectPath,
						})
					: authClient.signIn.magicLink({
							email: value.email,
							callbackURL: redirectPath,
						}));

				if (error) {
					throw error;
				}

				if (invitationOnlyMode) {
					const { error } =
						await authClient.organization.acceptInvitation({
							invitationId,
						});

					if (error) {
						throw error;
					}

					router.push(config.auth.redirectAfterSignIn);
				} else {
					setIsSuccess(true);
				}
			} catch (e) {
				const errorCode =
					e && typeof e === "object" && "code" in e
						? (e.code as string)
						: undefined;

				// Check if this is a "user already exists" error
				if (
					errorCode === "USER_ALREADY_EXISTS" ||
					errorCode === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
				) {
					// Check if the email needs verification
					try {
						const { needsVerification } =
							await orpcClient.auth.checkEmailStatus({
								email: value.email,
							});

						if (needsVerification) {
							setEmailToResend(value.email);
							setShowResendOption(true);
							setRootError(null);
							return;
						}
					} catch {
						// Fall through to standard error handling
					}

					// Account exists and is verified - show login link
					setRootError(
						"An account with this email already exists. Please sign in instead.",
					);
					return;
				}

				setRootError(getAuthErrorMessage(errorCode));
			}
		},
	});

	const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

	const resendMutation = useMutation({
		mutationFn: async (email: string) => {
			const { error } = await authClient.sendVerificationEmail({
				email,
				callbackURL: redirectPath,
			});

			if (error) {
				// Check for rate limiting
				if (
					error.code === "TOO_MANY_REQUESTS" ||
					error.status === 429
				) {
					throw new Error(
						"Too many requests. Please wait a few minutes before trying again.",
					);
				}
				throw new Error(
					error.message || "Failed to send verification email",
				);
			}
		},
	});

	return (
		<div>
			<h1 className="font-bold text-xl md:text-2xl">Create an account</h1>
			<p className="mt-1 mb-6 text-foreground/60">
				Sign up to get started
			</p>

			{isSuccess && !invitationOnlyMode ? (
				<Alert variant="success">
					<MailboxIcon />
					<AlertTitle>
						Check your email to verify your account
					</AlertTitle>
				</Alert>
			) : (
				<>
					{invitationId && (
						<OrganizationInvitationAlert className="mb-6" />
					)}

					<form
						className="flex flex-col items-stretch gap-4"
						onSubmit={(e) => {
							e.preventDefault();
							e.stopPropagation();
							form.handleSubmit();
						}}
					>
						{showResendOption ? (
							<Alert variant="default">
								<MailboxIcon />
								<AlertTitle>Email not verified</AlertTitle>
								<AlertDescription>
									{resendMutation.isSuccess ? (
										<p>
											Verification email sent! Check your
											inbox for {emailToResend}.
										</p>
									) : (
										<>
											<p className="mb-3">
												An account with this email
												already exists but hasn't been
												verified yet.
											</p>
											{resendMutation.isError && (
												<p className="mb-2 text-sm text-destructive">
													{resendMutation.error
														?.message ||
														"Failed to send verification email"}
												</p>
											)}
											<div className="flex flex-wrap gap-2">
												<Button
													type="button"
													size="sm"
													variant="secondary"
													disabled={
														resendMutation.isPending
													}
													loading={
														resendMutation.isPending
													}
													onClick={() =>
														emailToResend &&
														resendMutation.mutate(
															emailToResend,
														)
													}
												>
													Resend verification email
												</Button>
												<Button
													type="button"
													size="sm"
													variant="ghost"
													asChild
												>
													<Link
														to="/login"
														search={searchParams}
													>
														Sign in instead
													</Link>
												</Button>
											</div>
										</>
									)}
								</AlertDescription>
							</Alert>
						) : (
							rootError && (
								<Alert variant="error">
									<AlertTriangleIcon />
									<AlertDescription>
										{rootError}
										{rootError.includes(
											"already exists",
										) && (
											<>
												{" "}
												<Link
													to="/login"
													search={searchParams}
													className="underline"
												>
													Sign in instead
												</Link>
											</>
										)}
									</AlertDescription>
								</Alert>
							)
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
									<Field
										data-invalid={hasErrors || undefined}
									>
										<FieldLabel htmlFor="name">
											Name
										</FieldLabel>
										<Input
											id="name"
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
											autoComplete="email"
											readOnly={!!prefillEmail}
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

						{config.auth.enablePasswordLogin && (
							<>
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
											<Field
												data-invalid={
													hasErrors || undefined
												}
											>
												<FieldLabel htmlFor="password">
													Password
												</FieldLabel>
												<div className="relative">
													<Input
														id="password"
														type={
															showPassword
																? "text"
																: "password"
														}
														className="pr-10"
														value={
															field.state.value
														}
														onChange={(e) =>
															field.handleChange(
																e.target.value,
															)
														}
														onBlur={
															field.handleBlur
														}
														autoComplete="new-password"
														aria-invalid={
															hasErrors ||
															undefined
														}
													/>
													<button
														type="button"
														onClick={() =>
															setShowPassword(
																!showPassword,
															)
														}
														className="absolute inset-y-0 right-0 flex items-center pr-4 text-primary text-xl"
													>
														{showPassword ? (
															<EyeOffIcon className="size-4" />
														) : (
															<EyeIcon className="size-4" />
														)}
													</button>
												</div>
												{hasErrors && (
													<FieldError
														errors={
															field.state.meta
																.errors
														}
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
												fieldApi.form.getFieldValue(
													"password",
												)
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
											<Field
												data-invalid={
													hasErrors || undefined
												}
											>
												<FieldLabel htmlFor="confirmPassword">
													Confirm password
												</FieldLabel>
												<div className="relative">
													<Input
														id="confirmPassword"
														type={
															showPassword
																? "text"
																: "password"
														}
														className="pr-10"
														value={
															field.state.value
														}
														onChange={(e) =>
															field.handleChange(
																e.target.value,
															)
														}
														onBlur={
															field.handleBlur
														}
														autoComplete="new-password"
														aria-invalid={
															hasErrors ||
															undefined
														}
													/>
													<button
														type="button"
														onClick={() =>
															setShowPassword(
																!showPassword,
															)
														}
														className="absolute inset-y-0 right-0 flex items-center pr-4 text-primary text-xl"
													>
														{showPassword ? (
															<EyeOffIcon className="size-4" />
														) : (
															<EyeIcon className="size-4" />
														)}
													</button>
												</div>
												{hasErrors && (
													<FieldError
														errors={
															field.state.meta
																.errors
														}
													/>
												)}
											</Field>
										);
									}}
								</form.Field>
							</>
						)}

						<Button loading={isSubmitting}>Sign up</Button>
					</form>

					{config.auth.enableSignup &&
						config.auth.enableSocialLogin && (
							<>
								<div className="relative my-6 h-4">
									<hr className="relative top-2" />
									<p className="-translate-x-1/2 absolute top-0 left-1/2 mx-auto inline-block h-4 bg-card px-2 text-center font-medium text-foreground/60 text-sm leading-tight">
										Or continue with
									</p>
								</div>

								<div className="grid grid-cols-1 items-stretch gap-2 sm:grid-cols-2">
									{Object.keys(oAuthProviders).map(
										(providerId) => (
											<SocialSigninButton
												key={providerId}
												provider={
													providerId as OAuthProvider
												}
											/>
										),
									)}
								</div>
							</>
						)}
				</>
			)}

			<div className="mt-6 text-center text-sm">
				<span className="text-foreground/60">
					Already have an account?{" "}
				</span>
				<Link to="/login" search={searchParams}>
					Sign in
					<ArrowRightIcon className="ml-1 inline size-4 align-middle" />
				</Link>
			</div>
		</div>
	);
}
