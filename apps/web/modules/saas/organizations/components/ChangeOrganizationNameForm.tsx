"use client";

import { organizationNameSchema } from "@repo/api/lib/validation";
import { authClient } from "@repo/auth/client";
import { organizationsQueryKeys } from "@saas/organizations/lib/api";
import { SettingsItem } from "@saas/shared/client";
import { useRouter } from "@shared/hooks/router";
import { useForm, useStore } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@ui/components/button";
import { Field, FieldError } from "@ui/components/field";
import { Input } from "@ui/components/input";
import { toast } from "sonner";
import { useActiveOrganization } from "../hooks/use-active-organization";

export function ChangeOrganizationNameForm() {
	const router = useRouter();
	const queryClient = useQueryClient();
	const { activeOrganization } = useActiveOrganization();

	const form = useForm({
		defaultValues: {
			name: activeOrganization?.name ?? "",
		},
		onSubmit: async ({ value }) => {
			if (!activeOrganization) {
				return;
			}

			try {
				const { error } = await authClient.organization.update({
					organizationId: activeOrganization.id,
					data: {
						name: value.name,
					},
				});

				if (error) {
					throw error;
				}

				toast.success("Organization name updated successfully");

				queryClient.invalidateQueries({
					queryKey: organizationsQueryKeys.list(),
				});
				router.refresh();
			} catch {
				toast.error("Failed to update organization name");
			}
		},
	});

	const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
	const isDirty = useStore(form.store, (state) => state.isDirty);
	const isValid = useStore(form.store, (state) => state.isValid);

	return (
		<SettingsItem title="Organization Name">
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
								<Input
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
						disabled={!(isValid && isDirty)}
						loading={isSubmitting}
					>
						Save
					</Button>
				</div>
			</form>
		</SettingsItem>
	);
}
