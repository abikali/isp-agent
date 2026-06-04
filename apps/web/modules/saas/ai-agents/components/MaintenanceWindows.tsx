"use client";

import {
	beirutWallClockToUtc,
	formatDate,
	formatDateTime,
	formatDateTimeLocalInput,
	formatTime,
	MEDIUM_DATE_TIME_FORMAT,
} from "@shared/lib/format";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@ui/components/alert-dialog";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import { Field, FieldLabel } from "@ui/components/field";
import { Input } from "@ui/components/input";
import { Textarea } from "@ui/components/textarea";
import { cn } from "@ui/lib";
import { formatDistanceToNow } from "date-fns";
import {
	CalendarClockIcon,
	PencilIcon,
	PlusIcon,
	Trash2Icon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
	useCreateMaintenanceWindow,
	useDeleteMaintenanceWindow,
	useUpdateMaintenanceWindow,
} from "../hooks/use-agents";

interface MaintenanceWindow {
	id: string;
	startsAt: string | Date;
	endsAt: string | Date;
	message: string;
}

type WindowStatus = "active" | "upcoming" | "ended";

interface DecoratedWindow extends MaintenanceWindow {
	start: Date;
	end: Date;
	status: WindowStatus;
}

const STATUS_ORDER: Record<WindowStatus, number> = {
	active: 0,
	upcoming: 1,
	ended: 2,
};

function decorate(w: MaintenanceWindow, now: number): DecoratedWindow {
	const start = new Date(w.startsAt);
	const end = new Date(w.endsAt);
	const status: WindowStatus =
		now >= end.getTime()
			? "ended"
			: now < start.getTime()
				? "upcoming"
				: "active";
	return { ...w, start, end, status };
}

function sortWindows(windows: DecoratedWindow[]): DecoratedWindow[] {
	return [...windows].sort((a, b) => {
		if (STATUS_ORDER[a.status] !== STATUS_ORDER[b.status]) {
			return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
		}
		// Active → soonest to end first; upcoming → soonest to start first;
		// ended → most recently ended first.
		if (a.status === "ended") {
			return b.end.getTime() - a.end.getTime();
		}
		if (a.status === "upcoming") {
			return a.start.getTime() - b.start.getTime();
		}
		return a.end.getTime() - b.end.getTime();
	});
}

/** "Jun 6, 14:00 → 16:00" (same Beirut day) or full range across days. */
function formatRange(start: Date, end: Date): string {
	const startStr = formatDateTime(start, MEDIUM_DATE_TIME_FORMAT);
	const sameDay = formatDate(start) === formatDate(end);
	const endStr = sameDay
		? formatTime(end, { hour: "2-digit", minute: "2-digit" })
		: formatDateTime(end, MEDIUM_DATE_TIME_FORMAT);
	return `${startStr} → ${endStr}`;
}

export function MaintenanceWindows({
	agentId,
	organizationId,
	windows,
}: {
	agentId: string;
	organizationId: string;
	windows: MaintenanceWindow[];
}) {
	// Tick every 30s so statuses and "starts in / ends in" labels stay live
	// without a refetch.
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), 30_000);
		return () => clearInterval(id);
	}, []);

	const [editing, setEditing] = useState<MaintenanceWindow | "new" | null>(
		null,
	);
	const [deleting, setDeleting] = useState<MaintenanceWindow | null>(null);
	const deleteWindow = useDeleteMaintenanceWindow();

	const decorated = sortWindows(windows.map((w) => decorate(w, now)));
	const activeCount = decorated.filter((w) => w.status === "active").length;
	const upcomingCount = decorated.filter(
		(w) => w.status === "upcoming",
	).length;

	async function handleDelete() {
		if (!deleting) {
			return;
		}
		try {
			await deleteWindow.mutateAsync({
				windowId: deleting.id,
				organizationId,
			});
			toast.success("Window removed");
			setDeleting(null);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to remove",
			);
		}
	}

	return (
		<div className="mb-3 rounded-lg border border-border bg-card shadow-xs">
			<div className="flex items-center justify-between gap-3 px-4 py-2.5">
				<div className="flex min-w-0 items-center gap-2 text-sm">
					<CalendarClockIcon className="size-4 shrink-0 text-muted-foreground" />
					<span className="font-medium">Scheduled maintenance</span>
					<span className="hidden truncate text-xs text-muted-foreground sm:inline">
						Plan windows ahead — the agent enters maintenance
						automatically
					</span>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					{activeCount > 0 && (
						<Badge variant="warning">{activeCount} active</Badge>
					)}
					{activeCount === 0 && upcomingCount > 0 && (
						<Badge variant="secondary">
							{upcomingCount} upcoming
						</Badge>
					)}
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={() => setEditing("new")}
					>
						<PlusIcon className="size-4" />
						Schedule
					</Button>
				</div>
			</div>

			{decorated.length > 0 && (
				<div className="border-t border-border/60">
					{decorated.map((w) => (
						<WindowRow
							key={w.id}
							window={w}
							onEdit={() => setEditing(w)}
							onDelete={() => setDeleting(w)}
						/>
					))}
				</div>
			)}

			{decorated.length === 0 && (
				<div className="border-t border-border/60 px-4 py-6 text-center">
					<p className="text-sm text-muted-foreground">
						No scheduled windows
					</p>
					<p className="mt-0.5 text-xs text-muted-foreground/70">
						Plan maintenance ahead of time and the agent will switch
						over on its own.
					</p>
				</div>
			)}

			{editing && (
				<WindowEditorDialog
					key={editing === "new" ? "new" : editing.id}
					agentId={agentId}
					organizationId={organizationId}
					window={editing === "new" ? null : editing}
					onClose={() => setEditing(null)}
				/>
			)}

			<AlertDialog
				open={deleting !== null}
				onOpenChange={(open) => {
					if (!open) {
						setDeleting(null);
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Remove this maintenance window?
						</AlertDialogTitle>
						<AlertDialogDescription>
							The agent will no longer enter maintenance for this
							time range. This can't be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleDelete}
							disabled={deleteWindow.isPending}
						>
							Remove
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

function WindowRow({
	window: w,
	onEdit,
	onDelete,
}: {
	window: DecoratedWindow;
	onEdit: () => void;
	onDelete: () => void;
}) {
	const dotTone =
		w.status === "active"
			? "bg-warning"
			: w.status === "upcoming"
				? "bg-info"
				: "bg-muted-foreground/40";
	const relative = formatDistanceToNow(
		w.status === "upcoming" ? w.start : w.end,
		{ addSuffix: true },
	);
	const statusLabel =
		w.status === "active"
			? `Active · ends ${relative}`
			: w.status === "upcoming"
				? `Starts ${relative}`
				: `Ended ${relative}`;

	return (
		<div
			className={cn(
				"flex items-start justify-between gap-3 border-b border-border/40 px-4 py-3 last:border-b-0",
				w.status === "ended" && "opacity-60",
			)}
		>
			<div className="flex min-w-0 items-start gap-2.5">
				<span
					className={cn(
						"mt-1.5 size-2 shrink-0 rounded-full",
						dotTone,
						w.status === "active" && "animate-pulse",
					)}
				/>
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
						<span className="font-medium text-sm">
							{formatRange(w.start, w.end)}
						</span>
						<Badge
							variant={
								w.status === "active" ? "warning" : "secondary"
							}
							className={cn(
								"text-[10px]",
								w.status === "upcoming" &&
									"border-info/40 text-info",
							)}
						>
							{statusLabel}
						</Badge>
					</div>
					<p className="mt-0.5 truncate text-xs text-muted-foreground">
						{w.message}
					</p>
				</div>
			</div>
			<div className="flex shrink-0 items-center gap-0.5">
				<Button
					type="button"
					size="icon"
					variant="ghost"
					className="size-8"
					onClick={onEdit}
					aria-label="Edit window"
				>
					<PencilIcon className="size-3.5" />
				</Button>
				<Button
					type="button"
					size="icon"
					variant="ghost"
					className="size-8 text-muted-foreground hover:text-destructive"
					onClick={onDelete}
					aria-label="Delete window"
				>
					<Trash2Icon className="size-3.5" />
				</Button>
			</div>
		</div>
	);
}

function WindowEditorDialog({
	agentId,
	organizationId,
	window: existing,
	onClose,
}: {
	agentId: string;
	organizationId: string;
	window: MaintenanceWindow | null;
	onClose: () => void;
}) {
	const createWindow = useCreateMaintenanceWindow();
	const updateWindow = useUpdateMaintenanceWindow();
	const isEdit = existing !== null;

	const [startLocal, setStartLocal] = useState(() =>
		existing
			? formatDateTimeLocalInput(existing.startsAt)
			: formatDateTimeLocalInput(new Date()),
	);
	const [endLocal, setEndLocal] = useState(() =>
		existing
			? formatDateTimeLocalInput(existing.endsAt)
			: formatDateTimeLocalInput(new Date(Date.now() + 60 * 60 * 1000)),
	);
	const [message, setMessage] = useState(existing?.message ?? "");

	const startDate = startLocal ? beirutWallClockToUtc(startLocal) : null;
	const endDate = endLocal ? beirutWallClockToUtc(endLocal) : null;
	const rangeInvalid =
		startDate !== null &&
		endDate !== null &&
		endDate.getTime() <= startDate.getTime();
	const canSave =
		startDate !== null &&
		endDate !== null &&
		!rangeInvalid &&
		message.trim().length > 0;

	const livePreview =
		startDate && endDate && !rangeInvalid
			? endDate.getTime() <= Date.now()
				? "This window is in the past."
				: startDate.getTime() <= Date.now()
					? "This window is active right now."
					: `Starts ${formatDistanceToNow(startDate, { addSuffix: true })}.`
			: null;

	const isPending = createWindow.isPending || updateWindow.isPending;

	async function handleSave() {
		if (!startDate || !endDate || !canSave) {
			return;
		}
		try {
			if (isEdit && existing) {
				await updateWindow.mutateAsync({
					windowId: existing.id,
					organizationId,
					startsAt: startDate.toISOString(),
					endsAt: endDate.toISOString(),
					message: message.trim(),
				});
				toast.success("Window updated");
			} else {
				await createWindow.mutateAsync({
					agentId,
					organizationId,
					startsAt: startDate.toISOString(),
					endsAt: endDate.toISOString(),
					message: message.trim(),
				});
				toast.success("Window scheduled");
			}
			onClose();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to save",
			);
		}
	}

	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) {
					onClose();
				}
			}}
		>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>
						{isEdit
							? "Edit maintenance window"
							: "Schedule maintenance"}
					</DialogTitle>
					<DialogDescription>
						Times are in Lebanon time (Asia/Beirut). The agent
						enters maintenance automatically during this window.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
						<Field>
							<FieldLabel htmlFor="window-start">
								Start
							</FieldLabel>
							<Input
								id="window-start"
								type="datetime-local"
								value={startLocal}
								onChange={(e) => setStartLocal(e.target.value)}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="window-end">End</FieldLabel>
							<Input
								id="window-end"
								type="datetime-local"
								value={endLocal}
								onChange={(e) => setEndLocal(e.target.value)}
								aria-invalid={rangeInvalid || undefined}
							/>
						</Field>
					</div>

					{rangeInvalid && (
						<p className="text-xs text-destructive">
							The end time must be after the start time.
						</p>
					)}
					{!rangeInvalid && livePreview && (
						<p className="text-xs text-muted-foreground">
							{livePreview}
						</p>
					)}

					<Field>
						<FieldLabel htmlFor="window-message">
							What should the agent know?
						</FieldLabel>
						<Textarea
							id="window-message"
							value={message}
							onChange={(e) => setMessage(e.target.value)}
							rows={3}
							placeholder="e.g. Core router upgrade overnight — brief outages expected. No action needed from customers."
						/>
					</Field>
				</div>

				<DialogFooter>
					<Button type="button" variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button
						type="button"
						onClick={handleSave}
						disabled={!canSave || isPending}
					>
						{isEdit ? "Save changes" : "Schedule window"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
