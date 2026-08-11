"use client";

import {
	WORKER_OPTION_LISTS,
	type WorkerOptionListKey,
} from "@repo/database/worker-options";
import { SettingsItem } from "@saas/shared/components/SettingsItem";
import { useOrganizationId } from "@shared/lib/organization";
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
import { Skeleton } from "@ui/components/skeleton";
import {
	ChevronDownIcon,
	ChevronUpIcon,
	PencilIcon,
	PlusIcon,
	TrashIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	useAllWorkerOptions,
	useCreateWorkerOption,
	useDeleteWorkerOption,
	useUpdateWorkerOption,
} from "../hooks/use-worker-options";

interface WorkerOptionItem {
	id: string;
	listKey: string;
	value: string;
	label: string;
	labelAr: string | null;
	sortOrder: number;
}

export function WorkerOptionsSettingsSkeleton() {
	return (
		<>
			{WORKER_OPTION_LISTS.map((list) => (
				<SettingsItem
					key={list.key}
					title={list.title}
					description={list.description}
					fullWidth
				>
					<div className="space-y-2">
						{Array.from({ length: 4 }).map((_, i) => (
							<Skeleton
								key={`${list.key}-skel-${i}`}
								className="h-12 w-full rounded-lg"
							/>
						))}
					</div>
				</SettingsItem>
			))}
		</>
	);
}

export function WorkerOptionsSettings() {
	const { options, isLoading } = useAllWorkerOptions();
	const [dialogList, setDialogList] = useState<WorkerOptionListKey | null>(
		null,
	);
	const [editing, setEditing] = useState<WorkerOptionItem | null>(null);

	if (isLoading) {
		return <WorkerOptionsSettingsSkeleton />;
	}

	function openCreate(listKey: WorkerOptionListKey) {
		setEditing(null);
		setDialogList(listKey);
	}

	function openEdit(option: WorkerOptionItem) {
		setEditing(option);
		setDialogList(option.listKey as WorkerOptionListKey);
	}

	return (
		<>
			{WORKER_OPTION_LISTS.map((list) => (
				<WorkerOptionList
					key={list.key}
					title={list.title}
					description={list.description}
					options={options
						.filter((option) => option.listKey === list.key)
						.sort((a, b) => a.sortOrder - b.sortOrder)}
					onCreate={() => openCreate(list.key)}
					onEdit={openEdit}
				/>
			))}

			{/* key resets internal state when switching between create/edit */}
			<WorkerOptionDialog
				key={editing?.id ?? `new-${dialogList}`}
				listKey={dialogList}
				option={editing}
				onClose={() => setDialogList(null)}
			/>
		</>
	);
}

// react-doctor-disable-next-line react-doctor/no-multi-comp -- one settings screen: the list section and its editor dialog belong together
function WorkerOptionList({
	title,
	description,
	options,
	onCreate,
	onEdit,
}: {
	title: string;
	description: string;
	options: WorkerOptionItem[];
	onCreate: () => void;
	onEdit: (option: WorkerOptionItem) => void;
}) {
	const organizationId = useOrganizationId();
	const deleteMutation = useDeleteWorkerOption();
	const updateMutation = useUpdateWorkerOption();

	function handleDelete(option: WorkerOptionItem) {
		if (!organizationId) {
			return;
		}
		toast.promise(
			deleteMutation.mutateAsync({ organizationId, id: option.id }),
			{
				loading: "Deleting…",
				success: `Deleted "${option.label}"`,
				error: (err) => err?.message || "Failed to delete",
			},
		);
	}

	/** Swap sort order with the neighbour in `direction`. */
	function handleMove(index: number, direction: -1 | 1) {
		const option = options[index];
		const neighbour = options[index + direction];
		if (!organizationId || !option || !neighbour) {
			return;
		}
		Promise.all([
			updateMutation.mutateAsync({
				organizationId,
				id: option.id,
				sortOrder: neighbour.sortOrder,
			}),
			updateMutation.mutateAsync({
				organizationId,
				id: neighbour.id,
				sortOrder: option.sortOrder,
			}),
		]).catch((err: Error) => toast.error(err.message || "Failed to move"));
	}

	return (
		<SettingsItem
			title={
				<div className="flex items-center justify-between">
					<span>{title}</span>
					<Button size="sm" variant="outline" onClick={onCreate}>
						<PlusIcon className="mr-1 size-4" />
						Add Option
					</Button>
				</div>
			}
			description={description}
			fullWidth
		>
			{options.length === 0 ? (
				<div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
					No options yet — the worker portal is falling back to the
					built-in defaults. Add one to take over the list.
				</div>
			) : (
				<div className="space-y-1">
					{options.map((option, index) => (
						<div
							key={option.id}
							className="flex items-center gap-3 rounded-lg border px-3 py-2.5"
						>
							<div className="flex flex-col">
								<Button
									variant="ghost"
									size="icon"
									className="size-5"
									aria-label={`Move ${option.label} up`}
									disabled={
										index === 0 || updateMutation.isPending
									}
									onClick={() => handleMove(index, -1)}
								>
									<ChevronUpIcon className="size-3.5" />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									className="size-5"
									aria-label={`Move ${option.label} down`}
									disabled={
										index === options.length - 1 ||
										updateMutation.isPending
									}
									onClick={() => handleMove(index, 1)}
								>
									<ChevronDownIcon className="size-3.5" />
								</Button>
							</div>
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-2">
									<span className="font-medium text-sm">
										{option.label}
									</span>
									{option.labelAr && (
										<span className="text-muted-foreground text-xs">
											({option.labelAr})
										</span>
									)}
								</div>
								<span className="font-mono text-muted-foreground text-xs">
									{option.value}
								</span>
							</div>
							<div className="flex items-center gap-1">
								<Button
									variant="ghost"
									size="icon"
									className="size-8"
									aria-label={`Edit ${option.label}`}
									onClick={() => onEdit(option)}
								>
									<PencilIcon className="size-3.5" />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									className="size-8 text-destructive hover:text-destructive"
									aria-label={`Delete ${option.label}`}
									onClick={() => handleDelete(option)}
									disabled={deleteMutation.isPending}
								>
									<TrashIcon className="size-3.5" />
								</Button>
							</div>
						</div>
					))}
				</div>
			)}
		</SettingsItem>
	);
}

// react-doctor-disable-next-line react-doctor/no-multi-comp -- editor dialog colocated with its settings screen
function WorkerOptionDialog({
	listKey,
	option,
	onClose,
}: {
	listKey: WorkerOptionListKey | null;
	option: WorkerOptionItem | null;
	onClose: () => void;
}) {
	const organizationId = useOrganizationId();
	const createMutation = useCreateWorkerOption();
	const updateMutation = useUpdateWorkerOption();

	const isEditing = !!option;
	const [value, setValue] = useState(option?.value ?? "");
	const [label, setLabel] = useState(option?.label ?? "");
	const [labelAr, setLabelAr] = useState(option?.labelAr ?? "");

	const isPending = createMutation.isPending || updateMutation.isPending;

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!organizationId || !listKey) {
			return;
		}

		const mutation =
			isEditing && option
				? updateMutation.mutateAsync({
						organizationId,
						id: option.id,
						label,
						labelAr: labelAr || undefined,
					})
				: createMutation.mutateAsync({
						organizationId,
						listKey,
						value: value.toLowerCase().replace(/\s+/g, "_"),
						label,
						labelAr: labelAr || undefined,
					});

		toast.promise(mutation, {
			loading: "Saving…",
			success: () => {
				onClose();
				return isEditing ? "Option updated" : "Option created";
			},
			error: (err) => err?.message || "Failed to save",
		});
	}

	return (
		<Dialog
			open={listKey !== null}
			onOpenChange={(open) => {
				if (!open) {
					onClose();
				}
			}}
		>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{isEditing ? "Edit Option" : "Add Option"}
					</DialogTitle>
				</DialogHeader>

				<form onSubmit={handleSubmit} className="space-y-4">
					{!isEditing && (
						<div>
							<Label htmlFor="wo-value">Value (identifier)</Label>
							<Input
								id="wo-value"
								value={value}
								onChange={(e) =>
									setValue(
										e.target.value
											.toLowerCase()
											.replace(/[^a-z0-9_]/g, ""),
									)
								}
								placeholder="e.g. toolkit"
								required
								className="mt-1 font-mono"
							/>
							<p className="mt-1 text-muted-foreground text-xs">
								Lowercase letters, numbers, underscores only.
								Stored on every record that uses this option, so
								it can't be changed later.
							</p>
						</div>
					)}

					<div>
						<Label htmlFor="wo-label">Label</Label>
						<Input
							id="wo-label"
							value={label}
							onChange={(e) => setLabel(e.target.value)}
							placeholder="e.g. Toolkit"
							required
							className="mt-1"
						/>
					</div>

					<div>
						<Label htmlFor="wo-labelAr">
							Arabic Label (optional)
						</Label>
						<Input
							id="wo-labelAr"
							value={labelAr}
							onChange={(e) => setLabelAr(e.target.value)}
							placeholder="e.g. عدة"
							dir="rtl"
							className="mt-1"
						/>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={onClose}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={isPending}>
							{isPending
								? "Saving…"
								: isEditing
									? "Save Changes"
									: "Create"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
