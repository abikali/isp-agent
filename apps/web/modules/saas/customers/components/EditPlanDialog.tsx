"use client";

import { useOrganizationId } from "@shared/lib/organization";
import { useForm, useStore } from "@tanstack/react-form";
import { Button } from "@ui/components/button";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import {
	Sheet,
	SheetContent,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@ui/components/sheet";
import { Textarea } from "@ui/components/textarea";
import { toast } from "sonner";
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
			try {
				await updatePlan.mutateAsync({
					organizationId,
					id: plan.id,
					name: value.name,
					description: value.description || undefined,
					downloadSpeed: value.downloadSpeed,
					uploadSpeed: value.uploadSpeed,
					monthlyPrice: value.monthlyPrice,
				});
				toast.success("Plan updated");
				onOpenChange(false);
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: "Failed to update plan",
				);
			}
		},
	});

	const isSubmitting = useStore(form.store, (s) => s.isSubmitting);

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
			>
				<SheetHeader className="border-b border-border px-6 py-4">
					<SheetTitle>Edit Service Plan</SheetTitle>
				</SheetHeader>
				{/* react-doctor-disable-next-line react-doctor/no-prevent-default -- client-side TanStack Form (project convention); no server action exists to delegate to */}
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className="flex flex-1 flex-col overflow-hidden"
				>
					<div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
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

						<div className="grid gap-4 sm:grid-cols-2">
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
					</div>
					<SheetFooter className="border-t border-border bg-surface-subtle/40 px-6 py-3">
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
					</SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	);
}
