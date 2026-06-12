"use client";

import { TASK_RESOLUTION_OPTIONS } from "@saas/tasks";
import {
	useCompleteTaskWithEvidence,
	useCreateEvidenceUploadUrl,
} from "@saas/tasks/client";
import { displayName } from "@shared/lib/display-name";
import { formatDate } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Card, CardContent } from "@ui/components/card";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import {
	Sheet,
	SheetContent,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@ui/components/sheet";
import { Skeleton } from "@ui/components/skeleton";
import { Textarea } from "@ui/components/textarea";
import {
	ClipboardListIcon,
	MapPinIcon,
	PhoneIcon,
	PlusIcon,
	Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useMyStockQuery, useMyTasksQuery } from "../hooks/use-worker";
import { PhotoCaptureInput } from "./PhotoCaptureInput";

type WorkerTask = ReturnType<typeof useMyTasksQuery>["tasks"][number];

interface RecoveredItem {
	key: number;
	stockItemId: string | null;
	itemName: string;
	quantity: number;
	pictureUrl: string | null;
}

export function WorkerTasks() {
	const { tasks, isLoading } = useMyTasksQuery();
	const [activeTask, setActiveTask] = useState<WorkerTask | null>(null);

	if (isLoading) {
		return (
			<div className="space-y-2">
				{Array.from({ length: 3 }).map((_, i) => (
					<Skeleton
						key={`task-skel-${i}`}
						className="h-24 rounded-lg"
					/>
				))}
			</div>
		);
	}

	if (tasks.length === 0) {
		return (
			<div className="py-16 text-center">
				<ClipboardListIcon className="mx-auto size-10 text-muted-foreground/50" />
				<p className="mt-3 text-sm text-muted-foreground">
					No open tasks assigned to you.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-2">
			{tasks.map((task) => {
				const customerName = task.customer
					? displayName(
							task.customer.firstName,
							task.customer.lastName,
						)
					: null;
				const isUninstall = task.category === "UNINSTALL";
				return (
					<Card key={task.id}>
						<CardContent className="space-y-2 p-4">
							<div className="flex items-start justify-between gap-2">
								<div className="min-w-0">
									<p className="text-sm font-medium">
										{task.title}
									</p>
									{task.description && (
										<p className="line-clamp-2 text-xs text-muted-foreground">
											{task.description}
										</p>
									)}
								</div>
								<Badge
									variant={isUninstall ? "warning" : "info"}
								>
									{task.category.toLowerCase()}
								</Badge>
							</div>
							{customerName && (
								<div className="space-y-1 text-xs text-muted-foreground">
									<p className="font-medium text-foreground">
										{customerName}
									</p>
									{task.customer?.address && (
										<p className="flex items-center gap-1">
											<MapPinIcon className="size-3" />
											{task.customer.address}
										</p>
									)}
									{task.customer?.mobile && (
										<a
											href={`tel:${task.customer.mobile}`}
											className="flex items-center gap-1 text-primary"
										>
											<PhoneIcon className="size-3" />
											{task.customer.mobile}
										</a>
									)}
								</div>
							)}
							<div className="flex items-center justify-between pt-1">
								<span className="text-xs text-muted-foreground">
									Assigned{" "}
									{formatDate(task.createdAt, {
										dateStyle: "medium",
									})}
								</span>
								<Button
									size="sm"
									onClick={() => setActiveTask(task)}
								>
									Submit
								</Button>
							</div>
						</CardContent>
					</Card>
				);
			})}

			{activeTask &&
				(activeTask.category === "UNINSTALL" ? (
					<UninstallSubmitSheet
						task={activeTask}
						onClose={() => setActiveTask(null)}
					/>
				) : (
					<MaintenanceSubmitSheet
						task={activeTask}
						onClose={() => setActiveTask(null)}
					/>
				))}
		</div>
	);
}

function MaintenanceSubmitSheet({
	task,
	onClose,
}: {
	task: WorkerTask;
	onClose: () => void;
}) {
	const organizationId = useOrganizationId();
	const complete = useCompleteTaskWithEvidence();
	const createUploadUrl = useCreateEvidenceUploadUrl();
	const [resolutionCode, setResolutionCode] = useState("no_problem");
	const [note, setNote] = useState("");
	const [photoUrl, setPhotoUrl] = useState<string | null>(null);

	async function handleSubmit() {
		if (!organizationId) {
			return;
		}
		if (resolutionCode === "custom" && !note.trim()) {
			toast.error("A note is required for 'Other'");
			return;
		}
		try {
			await complete.mutateAsync({
				organizationId,
				taskId: task.id,
				resolutionCode: resolutionCode as never,
				resolutionNote: note.trim() || undefined,
				photoUrl: photoUrl ?? undefined,
			});
			toast.success("Task completed");
			onClose();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to submit",
			);
		}
	}

	return (
		<Sheet open onOpenChange={(open) => !open && onClose()}>
			<SheetContent
				side="bottom"
				className="flex max-h-[90dvh] flex-col gap-0 overflow-y-auto p-0"
			>
				<SheetHeader className="border-b px-4 py-3">
					<SheetTitle>Complete — {task.title}</SheetTitle>
				</SheetHeader>
				<div className="flex-1 space-y-4 px-4 py-4">
					<div className="space-y-1.5">
						<Label>What did you find?</Label>
						<Select
							value={resolutionCode}
							onValueChange={setResolutionCode}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{TASK_RESOLUTION_OPTIONS.map((opt) => (
									<SelectItem
										key={opt.value}
										value={opt.value}
									>
										{opt.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="maint-note">
							Note{resolutionCode === "custom" ? " *" : ""}
						</Label>
						<Textarea
							id="maint-note"
							value={note}
							onChange={(e) => setNote(e.target.value)}
							rows={2}
							placeholder="Anything worth noting?"
						/>
					</div>
					<div className="space-y-1.5">
						<Label>Photo (optional)</Label>
						<PhotoCaptureInput
							value={photoUrl}
							onChange={setPhotoUrl}
							getUploadUrl={async (file) => {
								if (!organizationId) {
									throw new Error("No organization");
								}
								const result =
									await createUploadUrl.mutateAsync({
										organizationId,
										filename: file.name,
										contentType: file.type,
									});
								return {
									uploadUrl: result.uploadUrl,
									publicUrl: result.publicUrl,
								};
							}}
						/>
					</div>
				</div>
				<SheetFooter className="border-t px-4 py-3">
					<Button
						className="w-full"
						onClick={handleSubmit}
						disabled={complete.isPending}
					>
						{complete.isPending ? "Submitting…" : "Complete task"}
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}

function UninstallSubmitSheet({
	task,
	onClose,
}: {
	task: WorkerTask;
	onClose: () => void;
}) {
	const organizationId = useOrganizationId();
	const complete = useCompleteTaskWithEvidence();
	const createUploadUrl = useCreateEvidenceUploadUrl();
	const { allocations } = useMyStockQuery();
	const [items, setItems] = useState<RecoveredItem[]>([
		{
			key: 1,
			stockItemId: null,
			itemName: "",
			quantity: 1,
			pictureUrl: null,
		},
	]);

	function updateItem(key: number, patch: Partial<RecoveredItem>) {
		setItems((prev) =>
			prev.map((item) =>
				item.key === key ? { ...item, ...patch } : item,
			),
		);
	}

	const valid = items.every(
		(item) =>
			(item.stockItemId || item.itemName.trim()) &&
			item.quantity >= 1 &&
			item.pictureUrl !== null,
	);

	async function handleSubmit() {
		if (!organizationId || !valid) {
			return;
		}
		try {
			await complete.mutateAsync({
				organizationId,
				taskId: task.id,
				items: items.map((item) => ({
					stockItemId: item.stockItemId ?? undefined,
					itemName: item.itemName.trim() || undefined,
					quantity: item.quantity,
					pictureUrl: item.pictureUrl as string,
				})),
			});
			toast.success("Recovered items submitted for review");
			onClose();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to submit",
			);
		}
	}

	return (
		<Sheet open onOpenChange={(open) => !open && onClose()}>
			<SheetContent
				side="bottom"
				className="flex max-h-[90dvh] flex-col gap-0 overflow-y-auto p-0"
			>
				<SheetHeader className="border-b px-4 py-3">
					<SheetTitle>Recovered equipment — {task.title}</SheetTitle>
				</SheetHeader>
				<div className="flex-1 space-y-4 px-4 py-4">
					{items.map((item, index) => (
						<div
							key={item.key}
							className="space-y-3 rounded-md border p-3"
						>
							<div className="flex items-center justify-between">
								<p className="text-sm font-medium">
									Item {index + 1}
								</p>
								{items.length > 1 && (
									<Button
										variant="ghost"
										size="icon"
										className="size-7"
										onClick={() =>
											setItems((prev) =>
												prev.filter(
													(i) => i.key !== item.key,
												),
											)
										}
										aria-label="Remove item"
									>
										<Trash2Icon className="size-4" />
									</Button>
								)}
							</div>
							<div className="space-y-1.5">
								<Label>Item</Label>
								<Select
									value={item.stockItemId ?? "custom"}
									onValueChange={(v) =>
										updateItem(item.key, {
											stockItemId:
												v === "custom" ? null : v,
										})
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="custom">
											Other / type a name
										</SelectItem>
										{allocations.map((alloc) => (
											<SelectItem
												key={alloc.stockItem.id}
												value={alloc.stockItem.id}
											>
												{alloc.stockItem.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								{!item.stockItemId && (
									<Input
										value={item.itemName}
										onChange={(e) =>
											updateItem(item.key, {
												itemName: e.target.value,
											})
										}
										placeholder="Item name"
									/>
								)}
							</div>
							<div className="space-y-1.5">
								<Label>Quantity</Label>
								<Input
									type="number"
									inputMode="numeric"
									min={1}
									value={item.quantity}
									onChange={(e) =>
										updateItem(item.key, {
											quantity: Number(e.target.value),
										})
									}
								/>
							</div>
							<div className="space-y-1.5">
								<Label>Photo evidence *</Label>
								<PhotoCaptureInput
									value={item.pictureUrl}
									onChange={(url) =>
										updateItem(item.key, {
											pictureUrl: url,
										})
									}
									getUploadUrl={async (file) => {
										if (!organizationId) {
											throw new Error("No organization");
										}
										const result =
											await createUploadUrl.mutateAsync({
												organizationId,
												filename: file.name,
												contentType: file.type,
											});
										return {
											uploadUrl: result.uploadUrl,
											publicUrl: result.publicUrl,
										};
									}}
								/>
							</div>
						</div>
					))}
					<Button
						variant="outline"
						className="w-full"
						onClick={() =>
							setItems((prev) => [
								...prev,
								{
									key:
										Math.max(...prev.map((i) => i.key), 0) +
										1,
									stockItemId: null,
									itemName: "",
									quantity: 1,
									pictureUrl: null,
								},
							])
						}
					>
						<PlusIcon className="mr-2 size-4" />
						Add another item
					</Button>
				</div>
				<SheetFooter className="border-t px-4 py-3">
					<Button
						className="w-full"
						onClick={handleSubmit}
						disabled={complete.isPending || !valid}
					>
						{complete.isPending
							? "Submitting…"
							: "Submit for review"}
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
