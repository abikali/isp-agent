"use client";

import { useOrganizationId } from "@shared/lib/organization";
import { useForm, useStore } from "@tanstack/react-form";
import { Button } from "@ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import { Textarea } from "@ui/components/textarea";
import { useUpdatePlan } from "../hooks/use-plans";

interface Plan {
	id: string;
	name: string;
	description: string | null;
	downloadSpeed: number;
	uploadSpeed: number;
	monthlyPrice: number;
}

export function EditPlanDialog({
	plan,
	open,
	onOpenChange,
}: {
	plan: Plan;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const organizationId = useOrganizationId();
	const updatePlan = useUpdatePlan();

	const form = useForm({
		defaultValues: {
			name: plan.name,
			description: plan.description ?? "",
			downloadSpeed: plan.downloadSpeed,
			uploadSpeed: plan.uploadSpeed,
			monthlyPrice: plan.monthlyPrice,
		},
		onSubmit: async ({ value }) => {
			if (!organizationId) {
				return;
			}
			await updatePlan.mutateAsync({
				organizationId,
				id: plan.id,
				name: value.name,
				description: value.description || undefined,
				downloadSpeed: value.downloadSpeed,
				uploadSpeed: value.uploadSpeed,
				monthlyPrice: value.monthlyPrice,
			});
			onOpenChange(false);
		},
	});

	const isSubmitting = useStore(form.store, (s) => s.isSubmitting);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Edit Service Plan</DialogTitle>
				</DialogHeader>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className="space-y-4"
				>
					<form.Field name="name">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor="edit-plan-name">Name</Label>
								<Input
									id="edit-plan-name"
									value={field.state.value}
									onChange={(e) =>
										field.handleChange(e.target.value)
									}
								/>
							</div>
						)}
					</form.Field>

					<form.Field name="description">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor="edit-plan-desc">
									Description
								</Label>
								<Textarea
									id="edit-plan-desc"
									value={field.state.value}
									onChange={(e) =>
										field.handleChange(e.target.value)
									}
									rows={2}
								/>
							</div>
						)}
					</form.Field>

					<div className="grid grid-cols-2 gap-4">
						<form.Field name="downloadSpeed">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor="edit-plan-down">
										Download (Mbps)
									</Label>
									<Input
										id="edit-plan-down"
										type="number"
										min={1}
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(
												Number(e.target.value),
											)
										}
									/>
								</div>
							)}
						</form.Field>

						<form.Field name="uploadSpeed">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor="edit-plan-up">
										Upload (Mbps)
									</Label>
									<Input
										id="edit-plan-up"
										type="number"
										min={1}
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(
												Number(e.target.value),
											)
										}
									/>
								</div>
							)}
						</form.Field>
					</div>

					<form.Field name="monthlyPrice">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor="edit-plan-price">
									Monthly Price ($)
								</Label>
								<Input
									id="edit-plan-price"
									type="number"
									min={0}
									step="0.01"
									value={field.state.value}
									onChange={(e) =>
										field.handleChange(
											Number(e.target.value),
										)
									}
								/>
							</div>
						)}
					</form.Field>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting ? "Saving..." : "Save Changes"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
