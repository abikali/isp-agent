"use client";

import { emailSchema, passwordLoginSchema } from "@repo/api/lib/validation";
import { authClient } from "@repo/auth/client";
import { config } from "@repo/config";
import { getAuthErrorMessage } from "@saas/auth/client";
import { authQueryKeys } from "@saas/auth/lib/api";
import { OrganizationInvitationAlert } from "@saas/organizations/client";
import { useRouter } from "@shared/hooks/router";
import { useForm, useStore } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
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
	KeyIcon,
	MailboxIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import {
	type OAuthProvider,
	oAuthProviders,
} from "../constants/oauth-providers";
import { useSession } from "../hooks/use-session";
import { LoginModeSwitch } from "./LoginModeSwitch";
import { SocialSigninButton } from "./SocialSigninButton";

const formSchema = z.union([
	z.object({
		mode: z.literal("magic-link"),
		email: z.string().email(),
	}),
	z.object({
		mode: z.literal("password"),
		email: z.string().email(),
		password: z.string().min(1),
	}),
]);

type FormValues = z.infer<typeof formSchema>;

export function LoginForm() {
	const router = useRouter();
	const queryClient = useQueryClient();
	const searchParams = useSearch({ strict: false }) as {
		invitationId?: string;
		email?: string;
		redirectTo?: string;
	};
	const { user, loaded: sessionLoaded } = useSession();

	const [showPassword, setShowPassword] = useState(false);
	const [rootError, setRootError] = useState<string | null>(null);
	const [isSuccess, setIsSuccess] = useState(false);
	const invitationId = searchParams.invitationId;
	const email = searchParams.email;
	const redirectTo = searchParams.redirectTo;

	const form = useForm({
		defaultValues: {
			email: email ?? "",
			password: "",
			mode: config.auth.enablePasswordLogin ? "password" : "magic-link",
		} as FormValues,
		onSubmit: async ({ value }) => {
			setRootError(null);
			try {
				if (value.mode === "password") {
					const { data, error } = await authClient.signIn.email({
						...value,
					});

					if (error) {
						throw error;
					}

					if (
						data &&
						"twoFactorRedirect" in data &&
						data.twoFactorRedirect
					) {
						router.navigate({
							to: "/verify",
							search: searchParams,
						});
						return;
					}

					queryClient.invalidateQueries({
						queryKey: authQueryKeys.session(),
					});

					router.replace(redirectPath);
				} else {
					const { error } = await authClient.signIn.magicLink({
						...value,
						callbackURL: redirectPath,
					});

					if (error) {
						throw error;
					}

					setIsSuccess(true);
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

	const redirectPath = invitationId
		? `/organization-invitation/${invitationId}`
		: (redirectTo ?? config.auth.redirectAfterSignIn);

	useEffect(() => {
		if (sessionLoaded && user) {
			router.replace(redirectPath);
		}
	}, [user, sessionLoaded, router, redirectPath]);

	const signInWithPasskey = async () => {
		try {
			await authClient.signIn.passkey();

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
	};

	const signinMode = useStore(form.store, (state) => state.values.mode);
	const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

	return (
		<div>
			<h1 className="font-bold text-xl md:text-2xl">Sign in</h1>
			<p className="mt-1 mb-6 text-foreground/60">
				Sign in to your account to continue
			</p>

			{isSuccess && signinMode === "magic-link" ? (
				<Alert variant="success">
					<MailboxIcon />
					<AlertTitle>Check your email</AlertTitle>
					<AlertDescription>
						We've sent you a magic link to sign in
					</AlertDescription>
				</Alert>
			) : (
				<>
					{invitationId && (
						<OrganizationInvitationAlert className="mb-6" />
					)}

					<form
						className="space-y-4"
						onSubmit={(e) => {
							e.preventDefault();
							e.stopPropagation();
							form.handleSubmit();
						}}
					>
						{config.auth.enableMagicLink &&
							config.auth.enablePasswordLogin && (
								<LoginModeSwitch
									activeMode={signinMode}
									onChange={(mode) =>
										form.setFieldValue(
											"mode",
											mode as "password" | "magic-link",
										)
									}
								/>
							)}

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

						{config.auth.enablePasswordLogin &&
							signinMode === "password" && (
								<form.Field
									name="password"
									validators={{
										onBlur: passwordLoginSchema,
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
												<div className="flex justify-between gap-4">
													<FieldLabel htmlFor="password">
														Password
													</FieldLabel>

													<Link
														to="/forgot-password"
														className="text-foreground/60 text-xs"
													>
														Forgot password?
													</Link>
												</div>
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
														autoComplete="current-password"
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
														aria-label={
															showPassword
																? "Hide password"
																: "Show password"
														}
														aria-pressed={
															showPassword
														}
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
							)}

						<Button
							className="w-full"
							type="submit"
							variant="secondary"
							loading={isSubmitting}
						>
							{signinMode === "magic-link"
								? "Send magic link"
								: "Sign in"}
						</Button>
					</form>

					{(config.auth.enablePasskeys ||
						(config.auth.enableSignup &&
							config.auth.enableSocialLogin)) && (
						<>
							<div className="relative my-6 h-4">
								<hr className="relative top-2" />
								<p className="-translate-x-1/2 absolute top-0 left-1/2 mx-auto inline-block h-4 bg-card px-2 text-center font-medium text-foreground/60 text-sm leading-tight">
									Or continue with
								</p>
							</div>

							<div className="grid grid-cols-2 items-stretch gap-2">
								{config.auth.enableSignup &&
									config.auth.enableSocialLogin &&
									Object.keys(oAuthProviders).map(
										(providerId) => (
											<SocialSigninButton
												key={providerId}
												provider={
													providerId as OAuthProvider
												}
											/>
										),
									)}

								{config.auth.enablePasskeys && (
									<Button
										variant="secondary"
										className="w-full"
										onClick={() => signInWithPasskey()}
									>
										<KeyIcon className="mr-1.5 size-4 text-primary" />
										Passkey
									</Button>
								)}
							</div>
						</>
					)}

					{config.auth.enableSignup && (
						<div className="mt-6 text-center text-sm">
							<span className="text-foreground/60">
								Don't have an account?{" "}
							</span>
							<Link to="/signup" search={searchParams}>
								Create an account
								<ArrowRightIcon className="ml-1 inline size-4 align-middle" />
							</Link>
						</div>
					)}
				</>
			)}

			{import.meta.env.DEV && (
				<div className="mt-6 rounded-lg border border-dashed border-yellow-500/50 bg-yellow-500/5 p-4">
					<p className="mb-3 text-center font-medium text-xs text-yellow-600 uppercase tracking-wide">
						Dev Quick Login
					</p>
					<div className="flex gap-2">
						{[
							{
								label: "Admin",
								email: "test@example.com",
								password: "TestPassword123!",
							},
							{
								label: "User 2",
								email: "test2@example.com",
								password: "TestPassword123!",
							},
						].map((account) => (
							<Button
								key={account.email}
								type="button"
								variant="outline"
								size="sm"
								className="flex-1"
								onClick={() => {
									form.setFieldValue("mode", "password");
									form.setFieldValue("email", account.email);
									form.setFieldValue(
										"password",
										account.password,
									);
									form.handleSubmit();
								}}
							>
								{account.label}
							</Button>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
