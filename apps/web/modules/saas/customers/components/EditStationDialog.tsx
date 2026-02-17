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
import { useUpdateStation } from "../hooks/use-stations";

interface Station {
	id: string;
	name: string;
	address: string | null;
	status: string;
	capacity: number | null;
	notes: string | null;
}

export function EditStationDialog({
	station,
	open,
	onOpenChange,
}: {
	station: Station;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const organizationId = useOrganizationId();
	const updateStation = useUpdateStation();

	const form = useForm({
		defaultValues: {
			name: station.name,
			address: station.address ?? "",
			status: station.status as "ACTIVE" | "MAINTENANCE" | "OFFLINE",
			capacity: station.capacity?.toString() ?? "",
			notes: station.notes ?? "",
		},
		onSubmit: async ({ value }) => {
			if (!organizationId) {
				return;
			}
			await updateStation.mutateAsync({
				organizationId,
				id: station.id,
				name: value.name,
				address: value.address || undefined,
				status: value.status,
				capacity: value.capacity ? Number(value.capacity) : undefined,
				notes: value.notes || undefined,
			});
			onOpenChange(false);
		},
	});

	const isSubmitting = useStore(form.store, (s) => s.isSubmitting);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Edit Station</DialogTitle>
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
								<Label htmlFor="edit-station-name">Name</Label>
								<Input
									id="edit-station-name"
									value={field.state.value}
									onChange={(e) =>
										field.handleChange(e.target.value)
									}
								/>
							</div>
						)}
					</form.Field>

					<form.Field name="address">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor="edit-station-address">
									Address
								</Label>
								<Input
									id="edit-station-address"
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
									<Label htmlFor="edit-station-cap">
										Capacity
									</Label>
									<Input
										id="edit-station-cap"
										type="number"
										min={1}
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
									/>
								</div>
							)}
						</form.Field>
					</div>

					<form.Field name="notes">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor="edit-station-notes">
									Notes
								</Label>
								<Textarea
									id="edit-station-notes"
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
							{isSubmitting ? "Saving..." : "Save Changes"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
