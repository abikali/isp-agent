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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/card";
import { Field, FieldLabel } from "@ui/components/field";
import { Input } from "@ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { Switch } from "@ui/components/switch";
import {
	CheckCircleIcon,
	DatabaseIcon,
	HandshakeIcon,
	ShieldAlertIcon,
	UsersIcon,
} from "lucide-react";
import { toast } from "sonner";
import { CreateOwnerDialog } from "./CreateOwnerDialog";

// react-doctor-disable-next-line react-doctor/no-giant-component -- cohesive admin org editor (details, members, dealer + iRadius cards); JSX-heavy, splitting would scatter shared org data/mutations
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

	const setActiveDealerMutation = useMutation({
		...orpc.admin.dealers.setActive.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.admin.organizations.key(),
			});
			toast.success("Dealer assignment updated");
		},
		onError: () => {
			toast.error("Failed to update dealer assignment");
		},
	});

	const setIradiusDisabledMutation = useMutation({
		...orpc.admin.organizations.setIradiusDisabled.mutationOptions(),
		onSuccess: (result) => {
			queryClient.invalidateQueries({
				queryKey: orpc.admin.organizations.key(),
			});
			toast.success(
				result.iradiusDisabled
					? "iRadius disabled for this organization"
					: "iRadius enabled for this organization",
			);
		},
		onError: (err) => {
			toast.error(err?.message || "Failed to update iRadius status");
		},
	});

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

	// Fetch ALL dealers (not just org-assigned) so admin can pick any dealer
	const { data: allDealersData } = useQuery(
		orpc.admin.dealers.list.queryOptions({
			input: { pageSize: 100 },
		}),
	);
	const dealers = allDealersData?.dealers ?? [];
	const activeDealer = organization?.activeDealer;
	const counts = organization?._count;

	function handleDealerChange(value: string) {
		if (!organization) {
			return;
		}
		setActiveDealerMutation.mutate({
			organizationId: organization.id,
			dealerId: value === "none" ? null : value,
		});
	}

	return (
		<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
			{/* Left column */}
			<div className="space-y-4">
				{/* Name card */}
				<Card>
					<CardHeader>
						<CardTitle>
							{organization
								? "Organization Details"
								: "Create Organization"}
						</CardTitle>
					</CardHeader>
					<CardContent>
						{/* react-doctor-disable-next-line react-doctor/no-prevent-default -- TanStack Form requires client-side onSubmit with preventDefault; there is no server-action submit path for this form */}
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
											data-invalid={
												hasErrors || undefined
											}
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

				{/* Stats card */}
				{counts && (
					<Card>
						<CardHeader>
							<CardTitle className="text-base">
								Overview
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-2 gap-4">
								<div className="text-center">
									<div className="text-2xl font-bold tabular-nums">
										{counts.customers}
									</div>
									<div className="text-xs text-muted-foreground">
										Customers
									</div>
								</div>
								<div className="text-center">
									<div className="text-2xl font-bold tabular-nums">
										{counts.employees}
									</div>
									<div className="text-xs text-muted-foreground">
										Employees
									</div>
								</div>
							</div>
						</CardContent>
					</Card>
				)}

				{/* Members card */}
				{organization && (
					<Card>
						<CardHeader className="flex flex-row items-center justify-between">
							<CardTitle className="flex items-center gap-2 text-base">
								<UsersIcon className="size-4" />
								Members
							</CardTitle>
							<CreateOwnerDialog
								organizationId={organization.id}
								organizationName={organization.name}
							/>
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
													{member.user.name ??
														"Unnamed"}
												</span>
												<span className="text-muted-foreground text-xs">
													{member.user.email}
												</span>
											</div>
											<Badge
												variant="secondary"
												className="capitalize"
											>
												{member.role}
											</Badge>
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

			{/* Right column — Dealer Assignment */}
			{organization && (
				<div className="space-y-4">
					<Card
						className={
							activeDealer
								? "border-green-500/20"
								: "border-destructive/20"
						}
					>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-base">
								<HandshakeIcon className="size-4" />
								Dealer Assignment
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							{/* Current status */}
							<div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
								{activeDealer ? (
									<>
										<CheckCircleIcon className="size-5 text-green-600 shrink-0" />
										<div>
											<div className="text-sm font-medium">
												{activeDealer.name}
											</div>
											<div className="text-xs text-muted-foreground">
												This organization can only see
												data belonging to this dealer.
											</div>
										</div>
									</>
								) : (
									<>
										<ShieldAlertIcon className="size-5 text-destructive shrink-0" />
										<div>
											<div className="text-sm font-medium text-destructive">
												No dealer assigned
											</div>
											<div className="text-xs text-muted-foreground">
												This organization is blocked
												from accessing any data. Assign
												a dealer below.
											</div>
										</div>
									</>
								)}
							</div>

							{/* Dealer selector */}
							<Field>
								<FieldLabel>Assign Dealer</FieldLabel>
								{dealers.length > 0 ? (
									<Select
										value={activeDealer?.id ?? "none"}
										onValueChange={handleDealerChange}
										disabled={
											setActiveDealerMutation.isPending
										}
									>
										<SelectTrigger>
											<SelectValue placeholder="Select a dealer..." />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="none">
												No dealer (block access)
											</SelectItem>
											{dealers.map((d) => (
												<SelectItem
													key={d.id}
													value={d.id}
												>
													{d.name}
													{d.status !== "ACTIVE" && (
														<span className="ml-1.5 text-muted-foreground">
															(
															{d.status.toLowerCase()}
															)
														</span>
													)}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								) : (
									<p className="text-sm text-muted-foreground rounded-md border border-dashed p-4 text-center">
										No dealers found. Sync from iRadius
										first.
									</p>
								)}
							</Field>

							{/* Explanation */}
							<div className="text-xs text-muted-foreground space-y-1">
								<p>
									When a dealer is assigned, this organization
									will only see customers, employees, plans,
									billing, and tasks belonging to that dealer.
								</p>
								<p>
									Selecting "No dealer" blocks all data access
									until a dealer is assigned.
								</p>
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-base">
								<DatabaseIcon className="size-4" />
								iRadius Integration
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="flex items-center justify-between gap-4 rounded-lg bg-muted/50 p-3">
								<div className="space-y-0.5">
									<div className="text-sm font-medium">
										{organization.iradiusDisabled
											? "Disabled — local-only"
											: "Enabled — mirroring to iRadius"}
									</div>
									<div className="text-xs text-muted-foreground">
										{organization.iradiusDisabled
											? "Customers, plans, employees and payments are managed entirely locally. No data flows to or from iRadius."
											: "Customer mutations mirror to iRadius. Sync and push tools are available."}
									</div>
								</div>
								<Switch
									checked={!organization.iradiusDisabled}
									onCheckedChange={(checked) =>
										setIradiusDisabledMutation.mutate({
											id: organization.id,
											disabled: !checked,
										})
									}
									disabled={
										setIradiusDisabledMutation.isPending
									}
									aria-label="Toggle iRadius integration"
								/>
							</div>
							<div className="text-xs text-muted-foreground space-y-1">
								<p>
									Disable when an organization's data should
									never sync to or from the legacy iRadius
									system (e.g. dealers managed only inside
									LibanCom).
								</p>
								<p>
									When disabled: customer status changes, plan
									changes, location updates, billing
									stop/reactivate flows write only to the
									local database. The "Import from iRadius"
									button is hidden in the customers page and
									the iRadius settings tab is replaced with a
									notice.
								</p>
							</div>
						</CardContent>
					</Card>
				</div>
			)}
		</div>
	);
}
