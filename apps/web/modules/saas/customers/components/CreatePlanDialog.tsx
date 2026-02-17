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
import { useCreatePlan } from "../hooks/use-plans";

export function CreatePlanDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const organizationId = useOrganizationId();
	const createPlan = useCreatePlan();

	const form = useForm({
		defaultValues: {
			name: "",
			description: "",
			downloadSpeed: 10,
			uploadSpeed: 5,
			monthlyPrice: 0,
		},
		onSubmit: async ({ value }) => {
			if (!organizationId) {
				return;
			}
			await createPlan.mutateAsync({
				organizationId,
				name: value.name,
				description: value.description || undefined,
				downloadSpeed: value.downloadSpeed,
				uploadSpeed: value.uploadSpeed,
				monthlyPrice: value.monthlyPrice,
			});
			onOpenChange(false);
			form.reset();
		},
	});

	const isSubmitting = useStore(form.store, (s) => s.isSubmitting);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Create Service Plan</DialogTitle>
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
								<Label htmlFor="plan-name">Name</Label>
								<Input
									id="plan-name"
									value={field.state.value}
									onChange={(e) =>
										field.handleChange(e.target.value)
									}
									placeholder="e.g. Basic 10Mbps"
								/>
							</div>
						)}
					</form.Field>

					<form.Field name="description">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor="plan-desc">
									Description (optional)
								</Label>
								<Textarea
									id="plan-desc"
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
									<Label htmlFor="plan-down">
										Download (Mbps)
									</Label>
									<Input
										id="plan-down"
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
									<Label htmlFor="plan-up">
										Upload (Mbps)
									</Label>
									<Input
										id="plan-up"
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
								<Label htmlFor="plan-price">
									Monthly Price ($)
								</Label>
								<Input
									id="plan-price"
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
							{isSubmitting ? "Creating..." : "Create Plan"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
