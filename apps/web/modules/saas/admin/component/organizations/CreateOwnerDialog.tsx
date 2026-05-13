"use client";

import {
	emailSchema,
	nameSchema,
	passwordSchema,
} from "@repo/api/lib/validation";
import { orpc } from "@shared/lib/orpc";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@ui/components/button";
import { Field, FieldError, FieldLabel } from "@ui/components/field";
import { Input } from "@ui/components/input";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@ui/components/sheet";
import { CopyIcon, KeyRoundIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

interface CreateOwnerDialogProps {
	organizationId: string;
	organizationName: string;
	trigger?: ReactNode;
}

interface SuccessSummary {
	email: string;
	password: string;
	passwordReused: boolean;
}

export function CreateOwnerDialog({
	organizationId,
	organizationName,
	trigger,
}: CreateOwnerDialogProps) {
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [summary, setSummary] = useState<SuccessSummary | null>(null);

	const createOwner = useMutation(
		orpc.admin.organizations.createOwner.mutationOptions(),
	);

	const form = useForm({
		defaultValues: {
			name: "",
			email: "",
			password: "",
		},
		onSubmit: async ({ value }) => {
			try {
				const result = await createOwner.mutateAsync({
					organizationId,
					name: value.name,
					email: value.email,
					password: value.password,
				});
				queryClient.invalidateQueries({
					queryKey: orpc.admin.organizations.key(),
				});
				setSummary({
					email: result.email,
					password: value.password,
					passwordReused: result.passwordReused,
				});
				if (result.passwordReused) {
					toast.success(
						"Existing user added to organization as owner",
					);
				} else {
					toast.success("Owner login created");
				}
				form.reset();
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: "Failed to create owner",
				);
			}
		},
	});

	const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

	function handleOpenChange(next: boolean) {
		setOpen(next);
		if (!next) {
			form.reset();
			setSummary(null);
		}
	}

	function copy(value: string) {
		navigator.clipboard.writeText(value);
		toast.success("Copied to clipboard");
	}

	return (
		<Sheet open={open} onOpenChange={handleOpenChange}>
			<SheetTrigger asChild>
				{trigger ?? (
					<Button variant="outline" size="sm">
						<KeyRoundIcon className="mr-1.5 size-3.5" />
						Create Owner Login
					</Button>
				)}
			</SheetTrigger>
			<SheetContent
				side="right"
				className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
			>
				<SheetHeader className="border-b border-border px-6 py-4">
					<SheetTitle>Create owner login</SheetTitle>
					<SheetDescription>
						Provision an email + password login with the owner role
						on{" "}
						<span className="font-semibold">
							{organizationName}
						</span>
						. If the email already has an account, that user is
						added as owner instead — the existing password is
						preserved.
					</SheetDescription>
				</SheetHeader>

				{summary ? (
					<>
						<div className="flex-1 overflow-y-auto px-6 py-5">
							<div className="space-y-3 rounded-md border bg-muted/30 p-4">
								<p className="text-sm font-medium">
									{summary.passwordReused
										? "Existing user added as owner"
										: "Owner login created"}
								</p>
								<div className="grid gap-2 text-sm">
									<div className="flex items-center gap-2">
										<span className="w-20 text-muted-foreground">
											Email
										</span>
										<code className="flex-1 rounded bg-background px-2 py-1 font-mono text-xs">
											{summary.email}
										</code>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											className="size-7"
											onClick={() => copy(summary.email)}
										>
											<CopyIcon className="size-3.5" />
										</Button>
									</div>
									{!summary.passwordReused && (
										<div className="flex items-center gap-2">
											<span className="w-20 text-muted-foreground">
												Password
											</span>
											<code className="flex-1 rounded bg-background px-2 py-1 font-mono text-xs">
												{summary.password}
											</code>
											<Button
												type="button"
												variant="ghost"
												size="icon"
												className="size-7"
												onClick={() =>
													copy(summary.password)
												}
											>
												<CopyIcon className="size-3.5" />
											</Button>
										</div>
									)}
								</div>
								{summary.passwordReused && (
									<p className="text-xs text-muted-foreground">
										This account already existed. Share the
										user&apos;s existing password or have
										them reset it from the login page.
									</p>
								)}
							</div>
						</div>
						<SheetFooter className="border-t border-border bg-surface-subtle/40 px-6 py-3">
							<Button onClick={() => handleOpenChange(false)}>
								Done
							</Button>
						</SheetFooter>
					</>
				) : (
					<form
						onSubmit={(e) => {
							e.preventDefault();
							e.stopPropagation();
							form.handleSubmit();
						}}
						className="flex flex-1 flex-col overflow-hidden"
					>
						<div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
							<form.Field
								name="name"
								validators={{ onBlur: nameSchema }}
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
											<FieldLabel htmlFor="owner-name">
												Display name
											</FieldLabel>
											<Input
												id="owner-name"
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
												autoComplete="off"
											/>
											{hasErrors && (
												<FieldError
													errors={
														field.state.meta.errors
													}
												/>
											)}
										</Field>
									);
								}}
							</form.Field>

							<form.Field
								name="email"
								validators={{ onBlur: emailSchema }}
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
											<FieldLabel htmlFor="owner-email">
												Email
											</FieldLabel>
											<Input
												id="owner-email"
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
												autoComplete="off"
											/>
											{hasErrors && (
												<FieldError
													errors={
														field.state.meta.errors
													}
												/>
											)}
										</Field>
									);
								}}
							</form.Field>

							<form.Field
								name="password"
								validators={{ onBlur: passwordSchema }}
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
											<FieldLabel htmlFor="owner-password">
												Password
											</FieldLabel>
											<Input
												id="owner-password"
												type="text"
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
												autoComplete="new-password"
											/>
											{hasErrors && (
												<FieldError
													errors={
														field.state.meta.errors
													}
												/>
											)}
										</Field>
									);
								}}
							</form.Field>
						</div>
						<SheetFooter className="border-t border-border bg-surface-subtle/40 px-6 py-3">
							<Button
								type="button"
								variant="ghost"
								onClick={() => handleOpenChange(false)}
							>
								Cancel
							</Button>
							<Button type="submit" loading={isSubmitting}>
								Create Owner Login
							</Button>
						</SheetFooter>
					</form>
				)}
			</SheetContent>
		</Sheet>
	);
}
