"use client";

import { ContentCard } from "@shared/components/ContentCard";
import { EmptyState } from "@shared/components/EmptyState";
import { MetricCard, MetricStrip } from "@shared/components/MetricCard";
import { PageShell } from "@shared/components/PageShell";
import { formatDateTime } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { Link, useNavigate } from "@tanstack/react-router";
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
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@ui/components/dropdown-menu";
import { Input } from "@ui/components/input";
import { Progress } from "@ui/components/progress";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/components/table";
import { cn } from "@ui/lib";
import {
	CheckCircleIcon,
	CopyIcon,
	MegaphoneIcon,
	MoreHorizontalIcon,
	PauseIcon,
	PencilIcon,
	PercentIcon,
	PlayIcon,
	PlusIcon,
	RotateCcwIcon,
	SearchIcon,
	Trash2Icon,
	UsersIcon,
	XCircleIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
	useBroadcasts,
	useCancelBroadcast,
	useDeleteBroadcast,
	useResendBroadcast,
} from "../hooks/use-marketing";
import {
	AUDIENCE_LABELS,
	BROADCAST_STATUS_VARIANTS,
} from "../lib/status-variants";

interface BroadcastsListProps {
	organizationSlug: string;
}

type StatusFilter =
	| "all"
	| "pending"
	| "running"
	| "completed"
	| "failed"
	| "cancelled";

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "running", label: "Running" },
	{ value: "pending", label: "Pending" },
	{ value: "completed", label: "Completed" },
	{ value: "failed", label: "Failed" },
	{ value: "cancelled", label: "Cancelled" },
];

const PAGE_SIZE = 25;

export function BroadcastsList({ organizationSlug }: BroadcastsListProps) {
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [audienceFilter, setAudienceFilter] = useState<string>("all");
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);
	const [debouncedSearch] = useDebouncedValue(search, { wait: 250 });

	const filters = useMemo(() => {
		const f: Parameters<typeof useBroadcasts>[0] = {
			page,
			pageSize: PAGE_SIZE,
		};
		if (statusFilter !== "all") {
			f.status = statusFilter;
		}
		if (audienceFilter !== "all") {
			f.audienceType = audienceFilter as never;
		}
		if (debouncedSearch.trim()) {
			f.search = debouncedSearch.trim();
		}
		return f;
	}, [statusFilter, audienceFilter, debouncedSearch, page]);

	const { items, total } = useBroadcasts(filters);

	const totals = items.reduce(
		(acc, b) => {
			acc.recipients += b.totalRecipients ?? 0;
			acc.sent += b.sentCount ?? 0;
			acc.failed += b.failedCount ?? 0;
			if (b.status === "running" || b.status === "pending") {
				acc.active += 1;
			}
			return acc;
		},
		{ recipients: 0, sent: 0, failed: 0, active: 0 },
	);
	const deliveryRate =
		totals.recipients > 0
			? Math.round((totals.sent / totals.recipients) * 100)
			: 0;

	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

	return (
		<PageShell
			title="Marketing"
			description="WhatsApp broadcasts via Salti. Send template messages to ISP customers, contact groups, or custom lists."
			actions={
				<Button asChild>
					<Link
						to="/app/$organizationSlug/marketing/new"
						params={{ organizationSlug }}
					>
						<PlusIcon className="size-4" />
						New broadcast
					</Link>
				</Button>
			}
		>
			{total > 0 && (
				<MetricStrip columns={5}>
					<MetricCard
						label="Broadcasts"
						value={total}
						icon={MegaphoneIcon}
						tone="info"
					/>
					<MetricCard
						label="Recipients"
						value={totals.recipients}
						icon={UsersIcon}
						tone="default"
					/>
					<MetricCard
						label="Delivered"
						value={totals.sent}
						icon={CheckCircleIcon}
						tone="success"
					/>
					<MetricCard
						label="Failed"
						value={totals.failed}
						icon={XCircleIcon}
						tone={totals.failed > 0 ? "danger" : "default"}
					/>
					<MetricCard
						label="Delivery rate"
						value={`${deliveryRate}%`}
						icon={PercentIcon}
						tone={
							deliveryRate >= 90
								? "success"
								: deliveryRate >= 70
									? "warning"
									: "danger"
						}
						hint={
							totals.active > 0
								? `${totals.active} active`
								: undefined
						}
						// react-doctor-disable-next-line react-doctor/jsx-no-jsx-as-prop -- `trailing` is a MetricCard layout slot; MetricCard is not memoized so re-render cost of inline JSX is negligible (canonical slot pattern)
						trailing={
							totals.active > 0 ? (
								<PlayIcon className="size-3 animate-pulse text-info" />
							) : undefined
						}
					/>
				</MetricStrip>
			)}

			{/* Filter chips */}
			<div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1">
				{STATUS_TABS.map((tab) => {
					const isActive = statusFilter === tab.value;
					return (
						<button
							type="button"
							key={tab.value}
							onClick={() => {
								setStatusFilter(tab.value);
								setPage(1);
							}}
							className={cn(
								"rounded-full border px-3 py-1 text-xs font-medium transition",
								isActive
									? "border-primary bg-primary text-primary-foreground"
									: "border-border bg-card text-muted-foreground hover:border-primary/40",
							)}
						>
							{tab.label}
						</button>
					);
				})}
			</div>

			<ContentCard>
				<div className="flex flex-col gap-2 border-b bg-surface-subtle/40 p-3 sm:flex-row sm:items-center">
					<div className="relative flex-1">
						<SearchIcon className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={search}
							onChange={(e) => {
								setSearch(e.target.value);
								setPage(1);
							}}
							placeholder="Search by name or template…"
							className="pl-8"
						/>
					</div>
					<Select
						value={audienceFilter}
						onValueChange={(v) => {
							setAudienceFilter(v);
							setPage(1);
						}}
					>
						<SelectTrigger className="sm:w-48">
							<SelectValue placeholder="Audience" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All audiences</SelectItem>
							<SelectItem value="isp_customers">
								ISP Customers
							</SelectItem>
							<SelectItem value="salti_group">
								Salti Group
							</SelectItem>
							<SelectItem value="csv">CSV upload</SelectItem>
							<SelectItem value="manual">Manual list</SelectItem>
						</SelectContent>
					</Select>
				</div>

				{items.length === 0 ? (
					<EmptyState
						icon={MegaphoneIcon}
						title={
							total === 0 && !debouncedSearch
								? "No broadcasts yet"
								: "No matches"
						}
						description={
							total === 0 && !debouncedSearch
								? "Launch your first WhatsApp broadcast to reach your customers."
								: "Try a different search or filter."
						}
						action={
							total === 0 && !debouncedSearch ? (
								<Button asChild>
									<Link
										to="/app/$organizationSlug/marketing/new"
										params={{ organizationSlug }}
									>
										Create broadcast
									</Link>
								</Button>
							) : undefined
						}
					/>
				) : (
					<>
						{/* Desktop table */}
						<div className="hidden md:block">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Name</TableHead>
										<TableHead>Audience</TableHead>
										<TableHead>Progress</TableHead>
										<TableHead className="text-right">
											Recipients
										</TableHead>
										<TableHead>Status</TableHead>
										<TableHead>Created</TableHead>
										<TableHead className="w-12" />
									</TableRow>
								</TableHeader>
								<TableBody>
									{items.map((b) => (
										<BroadcastRow
											key={b.id}
											broadcast={b}
											organizationSlug={organizationSlug}
										/>
									))}
								</TableBody>
							</Table>
						</div>

						{/* Mobile cards */}
						<div className="space-y-2 p-3 md:hidden">
							{items.map((b) => (
								<BroadcastCard
									key={b.id}
									broadcast={b}
									organizationSlug={organizationSlug}
								/>
							))}
						</div>

						{totalPages > 1 && (
							<div className="flex items-center justify-between border-t bg-surface-subtle/40 px-3 py-2.5 text-sm">
								<span className="text-muted-foreground">
									Showing {(page - 1) * PAGE_SIZE + 1}–
									{Math.min(page * PAGE_SIZE, total)} of{" "}
									{total}
								</span>
								<div className="flex items-center gap-2">
									<Button
										variant="outline"
										size="sm"
										disabled={page === 1}
										onClick={() =>
											setPage((p) => Math.max(1, p - 1))
										}
									>
										Previous
									</Button>
									<span className="text-xs text-muted-foreground">
										Page {page} of {totalPages}
									</span>
									<Button
										variant="outline"
										size="sm"
										disabled={page >= totalPages}
										onClick={() =>
											setPage((p) =>
												Math.min(totalPages, p + 1),
											)
										}
									>
										Next
									</Button>
								</div>
							</div>
						)}
					</>
				)}
			</ContentCard>
		</PageShell>
	);
}

type BroadcastItem = ReturnType<typeof useBroadcasts>["items"][number];

function BroadcastRow({
	broadcast: b,
	organizationSlug,
}: {
	broadcast: BroadcastItem;
	organizationSlug: string;
}) {
	const progressPct =
		b.totalRecipients > 0
			? Math.round(
					((b.sentCount + b.failedCount) / b.totalRecipients) * 100,
				)
			: 0;
	return (
		<TableRow>
			<TableCell className="font-medium">
				<Link
					to="/app/$organizationSlug/marketing/$broadcastId"
					params={{
						organizationSlug,
						broadcastId: b.id,
					}}
					className="hover:underline"
					preload="intent"
				>
					{b.name}
				</Link>
				<div className="mt-0.5 text-xs text-muted-foreground">
					{b.templateName} · {b.templateLang}
				</div>
			</TableCell>
			<TableCell>
				<Badge variant="outline" className="font-normal">
					{AUDIENCE_LABELS[b.audienceType] ?? b.audienceType}
				</Badge>
			</TableCell>
			<TableCell>
				<div className="w-32 space-y-1">
					<Progress value={progressPct} className="h-1.5" />
					<div className="flex items-center justify-between text-[10px] text-muted-foreground">
						<span>{progressPct}%</span>
						{b.failedCount > 0 ? (
							<span className="text-destructive">
								{b.failedCount} failed
							</span>
						) : (
							<span>{b.sentCount} sent</span>
						)}
					</div>
				</div>
			</TableCell>
			<TableCell className="text-right tabular-nums">
				{b.totalRecipients.toLocaleString()}
			</TableCell>
			<TableCell>
				<Badge
					variant={BROADCAST_STATUS_VARIANTS[b.status] ?? "outline"}
				>
					{b.status}
				</Badge>
			</TableCell>
			<TableCell>
				<div className="text-xs">{formatRelative(b.createdAt)}</div>
				<div className="text-[10px] text-muted-foreground">
					{formatDateTime(new Date(b.createdAt))}
				</div>
			</TableCell>
			<TableCell>
				<BroadcastActions
					broadcast={b}
					organizationSlug={organizationSlug}
				/>
			</TableCell>
		</TableRow>
	);
}

function BroadcastCard({
	broadcast: b,
	organizationSlug,
}: {
	broadcast: BroadcastItem;
	organizationSlug: string;
}) {
	const progressPct =
		b.totalRecipients > 0
			? Math.round(
					((b.sentCount + b.failedCount) / b.totalRecipients) * 100,
				)
			: 0;
	return (
		<div className="rounded-lg border bg-card p-3">
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0 flex-1">
					<Link
						to="/app/$organizationSlug/marketing/$broadcastId"
						params={{
							organizationSlug,
							broadcastId: b.id,
						}}
						className="block truncate font-medium hover:underline"
						preload="intent"
					>
						{b.name}
					</Link>
					<div className="mt-0.5 text-xs text-muted-foreground">
						{b.templateName} · {b.templateLang}
					</div>
				</div>
				<BroadcastActions
					broadcast={b}
					organizationSlug={organizationSlug}
				/>
			</div>
			<div className="mt-3 flex items-center gap-2">
				<Badge
					variant={BROADCAST_STATUS_VARIANTS[b.status] ?? "outline"}
				>
					{b.status}
				</Badge>
				<Badge variant="outline" className="font-normal">
					{AUDIENCE_LABELS[b.audienceType] ?? b.audienceType}
				</Badge>
			</div>
			<div className="mt-3 grid grid-cols-3 gap-2 text-xs">
				<div>
					<div className="text-muted-foreground">Recipients</div>
					<div className="font-medium tabular-nums">
						{b.totalRecipients.toLocaleString()}
					</div>
				</div>
				<div>
					<div className="text-muted-foreground">Sent</div>
					<div className="font-medium tabular-nums">
						{b.sentCount.toLocaleString()}
					</div>
				</div>
				<div>
					<div className="text-muted-foreground">Failed</div>
					<div
						className={cn(
							"font-medium tabular-nums",
							b.failedCount > 0 && "text-destructive",
						)}
					>
						{b.failedCount.toLocaleString()}
					</div>
				</div>
			</div>
			<div className="mt-3 space-y-1">
				<Progress value={progressPct} className="h-1.5" />
				<div className="flex items-center justify-between text-[10px] text-muted-foreground">
					<span>{progressPct}% processed</span>
					<span>{formatRelative(b.createdAt)}</span>
				</div>
			</div>
		</div>
	);
}

function BroadcastActions({
	broadcast: b,
	organizationSlug,
}: {
	broadcast: BroadcastItem;
	organizationSlug: string;
}) {
	const organizationId = useOrganizationId();
	const navigate = useNavigate();
	const cancel = useCancelBroadcast();
	const resend = useResendBroadcast();
	const remove = useDeleteBroadcast();
	const [confirmDelete, setConfirmDelete] = useState(false);

	const isInFlight = b.status === "pending" || b.status === "running";
	const isEditable = b.status === "pending";
	const isDeletable = b.status !== "running";

	const onCancel = async () => {
		if (!organizationId) {
			return;
		}
		try {
			await cancel.mutateAsync({ organizationId, broadcastId: b.id });
			toast.success("Broadcast cancelled");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Cancel failed");
		}
	};

	const onResend = async (onlyFailed = false) => {
		if (!organizationId) {
			return;
		}
		try {
			const result = await resend.mutateAsync({
				organizationId,
				broadcastId: b.id,
				onlyFailedRecipients: onlyFailed,
			});
			toast.success(
				onlyFailed
					? "Failed recipients queued for retry"
					: "Broadcast queued",
			);
			await navigate({
				to: "/app/$organizationSlug/marketing/$broadcastId",
				params: {
					organizationSlug,
					broadcastId: result.broadcast.id,
				},
			});
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Resend failed");
		}
	};

	const onDelete = async () => {
		if (!organizationId) {
			return;
		}
		try {
			await remove.mutateAsync({ organizationId, broadcastId: b.id });
			toast.success("Broadcast deleted");
			setConfirmDelete(false);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Delete failed");
		}
	};

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="size-7"
						aria-label="Broadcast actions"
					>
						<MoreHorizontalIcon className="size-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuLabel>Actions</DropdownMenuLabel>
					<DropdownMenuSeparator />
					{isEditable && (
						<DropdownMenuItem asChild>
							<Link
								to="/app/$organizationSlug/marketing/$broadcastId/edit"
								params={{
									organizationSlug,
									broadcastId: b.id,
								}}
							>
								<PencilIcon className="size-4" />
								Edit
							</Link>
						</DropdownMenuItem>
					)}
					{isInFlight && (
						<DropdownMenuItem
							onClick={onCancel}
							disabled={cancel.isPending}
						>
							<PauseIcon className="size-4" />
							{cancel.isPending ? "Cancelling…" : "Cancel"}
						</DropdownMenuItem>
					)}
					<DropdownMenuItem
						onClick={() => onResend(false)}
						disabled={resend.isPending}
					>
						<CopyIcon className="size-4" />
						{resend.isPending ? "Cloning…" : "Resend (clone)"}
					</DropdownMenuItem>
					{b.failedCount > 0 && (
						<DropdownMenuItem
							onClick={() => onResend(true)}
							disabled={resend.isPending}
						>
							<RotateCcwIcon className="size-4" />
							Retry failed only
						</DropdownMenuItem>
					)}
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onClick={() => setConfirmDelete(true)}
						disabled={!isDeletable}
						className="text-destructive focus:text-destructive"
					>
						<Trash2Icon className="size-4" />
						Delete
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete broadcast?</AlertDialogTitle>
						<AlertDialogDescription>
							This permanently removes "{b.name}" and all{" "}
							{b.totalRecipients.toLocaleString()} recipient
							records. This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={onDelete}
							disabled={remove.isPending}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							{remove.isPending ? "Deleting…" : "Delete"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

function formatRelative(date: Date | string): string {
	const d = typeof date === "string" ? new Date(date) : date;
	const diff = Date.now() - d.getTime();
	const minutes = Math.floor(diff / 60_000);
	if (minutes < 1) {
		return "just now";
	}
	if (minutes < 60) {
		return `${minutes}m ago`;
	}
	const hours = Math.floor(minutes / 60);
	if (hours < 24) {
		return `${hours}h ago`;
	}
	const days = Math.floor(hours / 24);
	if (days < 7) {
		return `${days}d ago`;
	}
	const weeks = Math.floor(days / 7);
	if (weeks < 5) {
		return `${weeks}w ago`;
	}
	return d.toLocaleDateString();
}

export function BroadcastsListSkeleton() {
	return (
		<PageShell title="Marketing">
			<div className="h-64 animate-pulse rounded-lg border bg-muted/20" />
		</PageShell>
	);
}
