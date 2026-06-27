"use client";

import { useOrganizationId } from "@shared/lib/organization";
import { Button } from "@ui/components/button";
import { Checkbox } from "@ui/components/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import { Textarea } from "@ui/components/textarea";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useEmployeesQuery } from "../../employees/hooks/use-employees";
import { type Base, useCreateBase, useUpdateBase } from "../hooks/use-bases";

interface BaseFormDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** When set, the dialog edits this base; otherwise it creates a new one. */
	base?: Base | null;
}

// react-doctor-disable-next-line react-doctor/prefer-useReducer -- independent form-field state slices; plain useState reads clearer than a reducer here
export function BaseFormDialog({
	open,
	onOpenChange,
	base,
}: BaseFormDialogProps) {
	const organizationId = useOrganizationId();
	const createBase = useCreateBase();
	const updateBase = useUpdateBase();
	const { employees } = useEmployeesQuery();

	const isEdit = Boolean(base);

	const [name, setName] = useState(base?.name ?? "");
	const [description, setDescription] = useState(base?.description ?? "");
	const [address, setAddress] = useState(base?.address ?? "");
	const [workerIds, setWorkerIds] = useState<string[]>(
		base?.workers.map((w) => w.id) ?? [],
	);
	const [workerSearch, setWorkerSearch] = useState("");

	const filteredEmployees = useMemo(() => {
		const term = workerSearch.trim().toLowerCase();
		if (!term) {
			return employees;
		}
		return employees.filter((e) => e.name.toLowerCase().includes(term));
	}, [employees, workerSearch]);

	function toggleWorker(id: string) {
		setWorkerIds((prev) =>
			prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id],
		);
	}

	const isPending = createBase.isPending || updateBase.isPending;
	const valid = name.trim().length > 0;

	async function handleSubmit() {
		if (!organizationId || !valid) {
			return;
		}
		try {
			if (isEdit && base) {
				await updateBase.mutateAsync({
					organizationId,
					id: base.id,
					name: name.trim(),
					description: description.trim() || null,
					address: address.trim() || null,
					workerIds,
				});
				toast.success("Base updated");
			} else {
				await createBase.mutateAsync({
					organizationId,
					name: name.trim(),
					description: description.trim() || undefined,
					address: address.trim() || undefined,
					workerIds,
				});
				toast.success("Base created");
			}
			onOpenChange(false);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to save base",
			);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>
						{isEdit ? "Edit base" : "New base"}
					</DialogTitle>
					<DialogDescription>
						A base is an operational hub you can assign to one or
						more workers.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="space-y-1.5">
						<Label htmlFor="base-name">Name *</Label>
						<Input
							id="base-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="e.g. North Depot"
						/>
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="base-address">Address</Label>
						<Input
							id="base-address"
							value={address}
							onChange={(e) => setAddress(e.target.value)}
							placeholder="Optional"
						/>
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="base-description">Description</Label>
						<Textarea
							id="base-description"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="Optional"
							rows={3}
						/>
					</div>

					<div className="space-y-1.5">
						<Label>
							Workers
							{workerIds.length > 0 && (
								<span className="ml-1 text-xs text-muted-foreground">
									({workerIds.length} selected)
								</span>
							)}
						</Label>
						<Input
							value={workerSearch}
							onChange={(e) => setWorkerSearch(e.target.value)}
							placeholder="Search workers…"
							className="mb-2"
						/>
						<div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
							{filteredEmployees.length === 0 ? (
								<p className="px-1 py-2 text-sm text-muted-foreground">
									No workers found.
								</p>
							) : (
								filteredEmployees.map((emp) => (
									<label
										key={emp.id}
										htmlFor={`base-worker-${emp.id}`}
										className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
									>
										<Checkbox
											id={`base-worker-${emp.id}`}
											checked={workerIds.includes(emp.id)}
											onCheckedChange={() =>
												toggleWorker(emp.id)
											}
										/>
										{emp.name}
									</label>
								))
							)}
						</div>
					</div>
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isPending}
					>
						Cancel
					</Button>
					<Button
						onClick={handleSubmit}
						disabled={!valid || isPending}
					>
						{isPending
							? "Saving…"
							: isEdit
								? "Save changes"
								: "Create base"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
