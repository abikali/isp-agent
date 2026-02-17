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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { Textarea } from "@ui/components/textarea";
import { useCreateStation } from "../hooks/use-stations";

export function CreateStationDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const organizationId = useOrganizationId();
	const createStation = useCreateStation();

	const form = useForm({
		defaultValues: {
			name: "",
			address: "",
			status: "ACTIVE" as "ACTIVE" | "MAINTENANCE" | "OFFLINE",
			capacity: "",
			notes: "",
		},
		onSubmit: async ({ value }) => {
			if (!organizationId) {
				return;
			}
			await createStation.mutateAsync({
				organizationId,
				name: value.name,
				address: value.address || undefined,
				status: value.status,
				capacity: value.capacity ? Number(value.capacity) : undefined,
				notes: value.notes || undefined,
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
					<DialogTitle>Create Station</DialogTitle>
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
								<Label htmlFor="station-name">Name</Label>
								<Input
									id="station-name"
									value={field.state.value}
									onChange={(e) =>
										field.handleChange(e.target.value)
									}
									placeholder="e.g. Tower A - Downtown"
								/>
							</div>
						)}
					</form.Field>

					<form.Field name="address">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor="station-address">
									Address (optional)
								</Label>
								<Input
									id="station-address"
									value={field.state.value}
									onChange={(e) =>
										field.handleChange(e.target.value)
									}
								/>
							</div>
						)}
					</form.Field>

					<div className="grid grid-cols-2 gap-4">
						<form.Field name="status">
							{(field) => (
								<div className="space-y-2">
									<Label>Status</Label>
									<Select
										value={field.state.value}
										onValueChange={(v) =>
											field.handleChange(
												v as
													| "ACTIVE"
													| "MAINTENANCE"
													| "OFFLINE",
											)
										}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="ACTIVE">
												Active
											</SelectItem>
											<SelectItem value="MAINTENANCE">
												Maintenance
											</SelectItem>
											<SelectItem value="OFFLINE">
												Offline
											</SelectItem>
										</SelectContent>
									</Select>
								</div>
							)}
						</form.Field>

						<form.Field name="capacity">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor="station-cap">
										Capacity
									</Label>
									<Input
										id="station-cap"
										type="number"
										min={1}
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
										placeholder="Max customers"
									/>
								</div>
							)}
						</form.Field>
					</div>

					<form.Field name="notes">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor="station-notes">
									Notes (optional)
								</Label>
								<Textarea
									id="station-notes"
									value={field.state.value}
									onChange={(e) =>
										field.handleChange(e.target.value)
									}
									rows={2}
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
							{isSubmitting ? "Creating..." : "Create Station"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
