"use client";

import { organizationNameSchema } from "@repo/api/lib/validation";
import {
	organizationsQueryKeys,
	useCreateOrganizationMutation,
} from "@saas/organizations/lib/api";
import { useRouter } from "@shared/hooks/router";
import { useForm, useStore } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@ui/components/button";
import { Field, FieldError, FieldLabel } from "@ui/components/field";
import { Input } from "@ui/components/input";
import { toast } from "sonner";
import { useActiveOrganization } from "../hooks/use-active-organization";

export function CreateOrganizationForm({
	defaultName,
}: {
	defaultName?: string;
}) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const { setActiveOrganization } = useActiveOrganization();
	const createOrganizationMutation = useCreateOrganizationMutation();

	const form = useForm({
		defaultValues: {
			name: defaultName ?? "",
		},
		onSubmit: async ({ value }) => {
			try {
				const newOrganization =
					await createOrganizationMutation.mutateAsync({
						name: value.name,
					});

				if (!newOrganization) {
					throw new Error("Failed to create organization");
				}

				await setActiveOrganization(newOrganization.slug);

				await queryClient.invalidateQueries({
					queryKey: organizationsQueryKeys.list(),
				});

				router.replace(`/app/${newOrganization.slug}`);
			} catch {
				toast.error("Failed to create organization");
			}
		},
	});

	const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

	return (
		<div className="mx-auto w-full max-w-md">
			<h1 className="font-bold text-xl md:text-2xl">
				Create Organization
			</h1>
			<p className="mt-2 mb-6 text-foreground/60">
				Organizations help you manage teams and collaborate effectively.
			</p>

			<form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					form.handleSubmit();
				}}
			>
				<form.Field
					name="name"
					validators={{
						onBlur: organizationNameSchema,
					}}
				>
					{(field) => {
						const hasErrors =
							field.state.meta.isTouched &&
							field.state.meta.errors.length > 0;
						return (
							<Field data-invalid={hasErrors || undefined}>
								<FieldLabel htmlFor="name">
									Organization Name
								</FieldLabel>
								<Input
									id="name"
									value={field.state.value}
									onChange={(e) =>
										field.handleChange(e.target.value)
									}
									onBlur={field.handleBlur}
									autoComplete="organization"
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

				<Button
					className="mt-6 w-full"
					type="submit"
					loading={isSubmitting}
				>
					Create Organization
				</Button>
			</form>
		</div>
	);
}
