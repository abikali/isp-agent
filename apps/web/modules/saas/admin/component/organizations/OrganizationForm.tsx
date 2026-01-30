"use client";

import { organizationNameSchema } from "@repo/api/lib/validation";
import { getAdminPath } from "@saas/admin/lib/links";
import {
	useCreateOrganizationMutation,
	useUpdateOrganizationMutation,
} from "@saas/organizations/lib/api";
import { useRouter } from "@shared/hooks/router";
import { orpc } from "@shared/lib/orpc";
import { useForm, useStore } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/card";
import { Field, FieldError, FieldLabel } from "@ui/components/field";
import { Input } from "@ui/components/input";
import { toast } from "sonner";

export function OrganizationForm({
	organizationId,
}: {
	organizationId: string;
}) {
	const router = useRouter();

	const { data: organization } = useQuery(
		orpc.admin.organizations.find.queryOptions({
			input: { id: organizationId },
		}),
	);

	const updateOrganizationMutation = useUpdateOrganizationMutation();
	const createOrganizationMutation = useCreateOrganizationMutation();
	const queryClient = useQueryClient();

	const form = useForm({
		defaultValues: {
			name: organization?.name ?? "",
		},
		onSubmit: async ({ value }) => {
			try {
				const newOrganization = organization
					? await updateOrganizationMutation.mutateAsync({
							id: organization.id,
							name: value.name,
							updateSlug: organization.name !== value.name,
						})
					: await createOrganizationMutation.mutateAsync({
							name: value.name,
						});

				if (!newOrganization) {
					throw new Error("Could not save organization");
				}

				queryClient.invalidateQueries({
					queryKey: orpc.admin.organizations.key(),
				});

				toast.success("Organization saved successfully");

				if (!organization) {
					router.replace(
						getAdminPath(`/organizations/${newOrganization.id}`),
					);
				}
			} catch {
				toast.error("Failed to save organization");
			}
		},
	});

	const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
	const isPending =
		updateOrganizationMutation.isPending ||
		createOrganizationMutation.isPending ||
		isSubmitting;

	return (
		<div className="grid grid-cols-1 gap-4">
			<Card>
				<CardHeader>
					<CardTitle>
						{organization
							? "Update Organization"
							: "Create Organization"}
					</CardTitle>
				</CardHeader>
				<CardContent>
					<form
						onSubmit={(e) => {
							e.preventDefault();
							e.stopPropagation();
							form.handleSubmit();
						}}
						className="grid grid-cols-1 gap-4"
					>
						<form.Field
							name="name"
							validators={{
								onChange: organizationNameSchema,
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

						<div className="flex justify-end">
							<Button type="submit" loading={isPending}>
								Save
							</Button>
						</div>
					</form>
				</CardContent>
			</Card>

			{organization && (
				<Card>
					<CardHeader>
						<CardTitle>Members</CardTitle>
					</CardHeader>
					<CardContent>
						{organization.members.length > 0 ? (
							<ul className="space-y-2">
								{organization.members.map((member) => (
									<li
										key={member.id}
										className="flex items-center justify-between rounded-md border px-3 py-2"
									>
										<div className="flex flex-col">
											<span className="text-sm font-medium">
												{member.user.name ?? "Unnamed"}
											</span>
											<span className="text-muted-foreground text-xs">
												{member.user.email}
											</span>
										</div>
										<span className="text-muted-foreground text-xs capitalize">
											{member.role}
										</span>
									</li>
								))}
							</ul>
						) : (
							<p className="text-muted-foreground text-sm">
								No members
							</p>
						)}
					</CardContent>
				</Card>
			)}
		</div>
	);
}
