"use client";

import { useEmployeesQuery } from "@saas/employees/client";
import { MultiSelectFilter } from "@saas/marketing/components/MultiSelectFilter";
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
import { useState } from "react";
import { toast } from "sonner";
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
	const { employees } = useEmployeesQuery();
	const [visibleWorkerIds, setVisibleWorkerIds] = useState<string[]>([]);

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
			try {
				await createPlan.mutateAsync({
					organizationId,
					name: value.name,
					description: value.description || undefined,
					downloadSpeed: value.downloadSpeed,
					uploadSpeed: value.uploadSpeed,
					monthlyPrice: value.monthlyPrice,
					visibleWorkerIds,
				});
				toast.success("Plan created");
				onOpenChange(false);
				form.reset();
				setVisibleWorkerIds([]);
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: "Failed to create plan",
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
					<SheetTitle>Create Service Plan</SheetTitle>
				</SheetHeader>
				{/* react-doctor-disable-next-line react-doctor/no-prevent-default -- TanStack Start SPA form: TanStack Form handles submit client-side via an oRPC mutation; there is no server action to post to */}
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

						<div className="grid gap-4 sm:grid-cols-2">
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

						<div className="space-y-2">
							<Label htmlFor="plan-workers">
								Visible to workers
							</Label>
							<MultiSelectFilter
								options={employees.map((e) => ({
									value: e.id,
									label: e.name,
								}))}
								value={visibleWorkerIds}
								onChange={setVisibleWorkerIds}
								placeholder="All workers"
								searchPlaceholder="Search workers…"
								emptyMessage="No workers"
							/>
							<p className="text-xs text-muted-foreground">
								Leave empty to show this plan to every worker in
								their portal. Pick workers to restrict it.
							</p>
						</div>
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
							{isSubmitting ? "Creating..." : "Create Plan"}
						</Button>
					</SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	);
}
