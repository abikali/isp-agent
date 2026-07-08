"use client";

import { useEmployeesQuery } from "@saas/employees/client";
import { TASK_RESOLUTION_LABELS } from "@saas/tasks";
import {
	ContentCard,
	ContentCardToolbar,
} from "@shared/components/ContentCard";
import { EmptyState } from "@shared/components/EmptyState";
import { ImageViewerDialog } from "@shared/components/ImageViewerDialog";
import { PageShell } from "@shared/components/PageShell";
import { PermissionGate } from "@shared/components/PermissionGate";
import { SearchInput } from "@shared/components/SearchInput";
import { TableColumnsToggle } from "@shared/components/TableColumnsToggle";
import { usePersistedColumnVisibility } from "@shared/hooks/use-persisted-column-visibility";
import { useServerSorting } from "@shared/hooks/use-server-sorting";
import { formatCurrency, formatDate, formatDateTime } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { DataTable } from "@ui/components/data-table";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import { Input } from "@ui/components/input";
import { Tabs, TabsList, TabsTrigger } from "@ui/components/tabs";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@ui/components/tooltip";
import {
	BoxIcon,
	CheckIcon,
	ClipboardListIcon,
	ImageIcon,
	PackageIcon,
	PuzzleIcon,
	RadioTowerIcon,
	StickyNoteIcon,
	WarehouseIcon,
	WrenchIcon,
	XIcon,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
	type InstallationStatus,
	useApproveInstallations,
	useDenyInstallation,
	useInstallationStatsQuery,
	useInstallations,
	useUpdatePendingInstallation,
} from "../hooks/use-installations";
import {
	INSTALLATION_STATUS_OPTIONS,
	INSTALLATION_TYPE_OPTIONS,
	InstallationFilters,
	type InstallationFiltersValue,
} from "./InstallationFilters";

type Installation = ReturnType<
	typeof useInstallations
>["installations"][number];

const PAGE_SIZE = 30;

const STATUS_BADGES: Record<
	InstallationStatus,
	{ label: string; variant: "info" | "success" | "error" | "outline" }
> = {
	PENDING: { label: "Pending", variant: "info" },
	APPROVED: { label: "Approved", variant: "success" },
	COMPLETED: { label: "Completed", variant: "success" },
	DENIED: { label: "Denied", variant: "error" },
};

const sortByMap = {
	quantity: "quantity",
	price: "price",
	installedAt: "installedAt",
} as const satisfies Record<string, string>;

const TOGGLEABLE_COLUMNS = [
	{ id: "item", label: "Item", alwaysVisible: true },
	{ id: "target", label: "Installed for" },
	{ id: "worker", label: "Worker" },
	{ id: "quantity", label: "Qty" },
	{ id: "price", label: "Price" },
	{ id: "total", label: "Total" },
	{ id: "installedAt", label: "Date" },
] as const;

const DEFAULT_FILTERS: InstallationFiltersValue = {
	type: "all",
	employeeId: "all",
	status: "all",
	dateFrom: "",
	dateTo: "",
	priceMin: "",
	priceMax: "",
	qtyMin: "",
	qtyMax: "",
};

function installationName(inst: Installation): string {
	return inst.stockItem?.name ?? inst.notes ?? "—";
}

function TypeIcon({ inst }: { inst: Installation }) {
	if (inst.isAddOn) {
		return <PuzzleIcon className="size-4 text-purple-500" />;
	}
	if (inst.stationId) {
		return <RadioTowerIcon className="size-4 text-blue-500" />;
	}
	if (inst.baseId) {
		return <WarehouseIcon className="size-4 text-amber-500" />;
	}
	return <BoxIcon className="size-4 text-muted-foreground" />;
}

function installationKind(inst: Installation): string {
	if (inst.isAddOn) {
		return "Add-on";
	}
	if (inst.stationId) {
		return "Station";
	}
	if (inst.baseId) {
		return "Base";
	}
	return "Item";
}

/**
 * Note typed on the installation row itself. Hidden when the row has no stock
 * item, because there the notes text already doubles as the row name.
 */
function installationNote(inst: Installation): string | null {
	return inst.stockItem ? (inst.notes?.trim() ?? null) : null;
}

/**
 * Worker's completion evidence from the linked field task: the canned
 * resolution label and/or free-text note recorded when the task was closed.
 */
function taskResolution(
	inst: Installation,
): { label: string | null; note: string | null } | null {
	const task = inst.task;
	if (!task) {
		return null;
	}
	const note = task.resolutionNote?.trim() || null;
	const label = task.resolutionCode
		? ((TASK_RESOLUTION_LABELS as Record<string, string>)[
				task.resolutionCode
			] ?? task.resolutionCode)
		: null;
	// A bare "Other" code without a note carries no information.
	if (!note && (!label || label === "Other")) {
		return null;
	}
	return { label, note };
}

function hasNotes(inst: Installation): boolean {
	return !!(installationNote(inst) || taskResolution(inst));
}

/** Compact "3d ago" style suffix for past dates. */
function relativeAgo(value: Date | string): string {
	const days = Math.floor(
		Math.abs(Date.now() - new Date(value).getTime()) / 86_400_000,
	);
	if (days === 0) {
		return "today";
	}
	if (days < 30) {
		return `${days}d ago`;
	}
	const months = Math.round(days / 30);
	if (months < 12) {
		return `${months}mo ago`;
	}
	return `${Math.round(months / 12)}y ago`;
}

/**
 * Leading visual for a row: the completion photo (clickable) when one was
 * recorded by closing a field task, otherwise a typed placeholder tile.
 */
function MediaThumb({
	inst,
	onView,
}: {
	inst: Installation;
	onView: (photo: { src: string; title: string }) => void;
}) {
	const photoUrl = inst.task?.completionPhotoUrl ?? null;
	if (photoUrl) {
		return (
			<button
				type="button"
				onClick={() =>
					onView({ src: photoUrl, title: installationName(inst) })
				}
				className="group relative size-11 shrink-0 overflow-hidden rounded-md border bg-muted"
				aria-label="View completion photo"
			>
				<img
					src={photoUrl}
					alt={installationName(inst)}
					loading="lazy"
					className="size-full object-cover transition-transform group-hover:scale-105"
				/>
				<span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
					<ImageIcon className="size-4 text-white opacity-0 transition-opacity group-hover:opacity-100" />
				</span>
			</button>
		);
	}
	return (
		<div className="flex size-11 shrink-0 items-center justify-center rounded-md border border-dashed bg-muted/40">
			<TypeIcon inst={inst} />
		</div>
	);
}

/** Modal with the full note text — tooltips don't work on touch devices. */
function InstallationNotesDialog({
	inst,
	onClose,
}: {
	inst: Installation;
	onClose: () => void;
}) {
	const note = installationNote(inst);
	const resolution = taskResolution(inst);
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) {
					onClose();
				}
			}}
		>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Notes — {installationName(inst)}</DialogTitle>
				</DialogHeader>
				<div className="space-y-4">
					{note && (
						<div className="space-y-1">
							<p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
								Installation note
							</p>
							<p className="whitespace-pre-wrap text-sm">
								{note}
							</p>
						</div>
					)}
					{resolution && (
						<div className="space-y-1.5">
							<p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
								Worker completion
							</p>
							{resolution.label && (
								<Badge variant="outline">
									{resolution.label}
								</Badge>
							)}
							{resolution.note && (
								<p className="whitespace-pre-wrap text-sm">
									{resolution.note}
								</p>
							)}
							<p className="text-xs text-muted-foreground">
								by {inst.employee.name}
								{inst.task?.completedAt
									? ` · ${formatDateTime(inst.task.completedAt, { dateStyle: "medium", timeStyle: "short" })}`
									: ""}
							</p>
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

/** Expanded detail panel: full notes, linked task, and review timeline. */
function InstallationSubRow({
	inst,
	organizationSlug,
	onViewPhoto,
}: {
	inst: Installation;
	organizationSlug: string;
	onViewPhoto: (photo: { src: string; title: string }) => void;
}) {
	const statusCfg = STATUS_BADGES[inst.status as InstallationStatus];
	const task = inst.task;
	const photoUrl = task?.completionPhotoUrl;
	const note = installationNote(inst);
	const resolution = taskResolution(inst);
	return (
		<div className="grid gap-x-8 gap-y-4 px-6 py-4 sm:grid-cols-2 lg:grid-cols-4">
			<div className="space-y-1">
				<p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
					Notes
				</p>
				{note || resolution ? (
					<div className="space-y-2">
						{note && (
							<p className="whitespace-pre-wrap text-sm">
								{note}
							</p>
						)}
						{resolution && (
							<div className="space-y-0.5">
								<p className="text-xs text-muted-foreground">
									Worker completion
									{resolution.label
										? ` · ${resolution.label}`
										: ""}
								</p>
								{resolution.note && (
									<p className="whitespace-pre-wrap text-sm">
										{resolution.note}
									</p>
								)}
							</div>
						)}
					</div>
				) : (
					<p className="text-sm text-muted-foreground">—</p>
				)}
			</div>

			<div className="space-y-1">
				<p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
					Source
				</p>
				<div className="space-y-1 text-sm">
					<p className="flex items-center gap-1.5">
						<TypeIcon inst={inst} />
						{installationKind(inst)}
						{inst.stockItem && <span>· {inst.stockItem.name}</span>}
					</p>
					{inst.setupRequestId && (
						<Badge variant="outline" className="gap-1">
							<PackageIcon className="size-3" />
							New-customer setup bundle
						</Badge>
					)}
					{inst.externalBillingId != null && (
						<p className="text-xs text-muted-foreground">
							Legacy billing #{inst.externalBillingId}
						</p>
					)}
				</div>
			</div>

			<div className="space-y-1">
				<p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
					Field task
				</p>
				{task ? (
					<div className="space-y-1 text-sm">
						<Link
							to="/app/$organizationSlug/tasks/$taskId"
							params={{ organizationSlug, taskId: task.id }}
							className="flex items-center gap-1.5 font-medium hover:underline"
							preload="intent"
						>
							<ClipboardListIcon className="size-3.5 shrink-0 text-muted-foreground" />
							<span className="truncate">{task.title}</span>
						</Link>
						{task.completedAt && (
							<p className="text-xs text-muted-foreground">
								Completed{" "}
								{formatDateTime(task.completedAt, {
									dateStyle: "medium",
									timeStyle: "short",
								})}
							</p>
						)}
						{photoUrl && (
							<Button
								variant="outline"
								size="sm"
								className="h-7"
								onClick={() =>
									onViewPhoto({
										src: photoUrl,
										title: installationName(inst),
									})
								}
							>
								<ImageIcon className="mr-1.5 size-3.5" />
								View photo
							</Button>
						)}
					</div>
				) : (
					<p className="text-sm text-muted-foreground">
						Direct worker-portal entry
					</p>
				)}
			</div>

			<div className="space-y-1">
				<p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
					Timeline
				</p>
				<div className="space-y-1 text-sm">
					<p>
						Installed{" "}
						{formatDateTime(inst.installedAt, {
							dateStyle: "medium",
							timeStyle: "short",
						})}
					</p>
					<p className="text-xs text-muted-foreground">
						Recorded{" "}
						{formatDateTime(inst.createdAt, {
							dateStyle: "medium",
							timeStyle: "short",
						})}{" "}
						by {inst.employee.name}
					</p>
					<p className="flex items-center gap-1.5">
						<Badge variant={statusCfg.variant}>
							{statusCfg.label}
						</Badge>
						{inst.approvedBy && (
							<span className="text-xs text-muted-foreground">
								by {inst.approvedBy.name}
								{inst.approvedAt
									? ` · ${formatDateTime(inst.approvedAt, { dateStyle: "medium", timeStyle: "short" })}`
									: ""}
							</span>
						)}
					</p>
				</div>
			</div>
		</div>
	);
}

/** Local edit state for inline price/qty on pending rows. */
interface RowEdit {
	price: string;
	quantity: string;
}

// react-doctor-disable-next-line react-doctor/no-giant-component -- cohesive installations review page: filters, inline row edits, and table column defs share local state; splitting would scatter tightly-coupled state
export function InstallationsList({
	organizationSlug,
}: {
	organizationSlug: string;
	// react-doctor-disable-next-line react-doctor/prefer-useReducer -- independent filter/inline-edit state slices read clearer as separate useState than a reducer
}) {
	const organizationId = useOrganizationId();
	const [tab, setTab] = useState<"pending" | "history">("pending");
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 200 });
	const [filterValues, setFilterValues] =
		useState<InstallationFiltersValue>(DEFAULT_FILTERS);
	const [page, setPage] = useState(1);
	const { sorting, sortBy, sortOrder, onSortingChange } = useServerSorting(
		sortByMap,
		() => setPage(1),
	);
	const [columnVisibility, setColumnVisibility] =
		usePersistedColumnVisibility("installations");
	const [edits, setEdits] = useState<Record<string, RowEdit>>({});
	const [photo, setPhoto] = useState<{ src: string; title: string } | null>(
		null,
	);
	const [notesFor, setNotesFor] = useState<Installation | null>(null);

	const { employees } = useEmployeesQuery();
	const { pendingValue } = useInstallationStatsQuery();

	const updateFilters = useCallback(
		(patch: Partial<InstallationFiltersValue>) => {
			setFilterValues((prev) => ({ ...prev, ...patch }));
			setPage(1);
		},
		[],
	);
	const resetFilters = useCallback(() => {
		setFilterValues(DEFAULT_FILTERS);
		setPage(1);
	}, []);

	const { installations, total, isFetching } = useInstallations({
		...(tab === "pending"
			? { status: "PENDING" as const }
			: filterValues.status !== "all"
				? { status: filterValues.status as InstallationStatus }
				: {}),
		...(filterValues.employeeId !== "all"
			? { employeeId: filterValues.employeeId }
			: {}),
		...(filterValues.type !== "all"
			? {
					type: filterValues.type as
						| "item"
						| "station"
						| "base"
						| "addon",
				}
			: {}),
		search: debouncedSearch || undefined,
		...(filterValues.dateFrom
			? { from: new Date(filterValues.dateFrom) }
			: {}),
		...(filterValues.dateTo
			? { to: new Date(`${filterValues.dateTo}T23:59:59`) }
			: {}),
		...(filterValues.priceMin !== ""
			? { priceMin: Number(filterValues.priceMin) }
			: {}),
		...(filterValues.priceMax !== ""
			? { priceMax: Number(filterValues.priceMax) }
			: {}),
		...(filterValues.qtyMin !== ""
			? { qtyMin: Number(filterValues.qtyMin) }
			: {}),
		...(filterValues.qtyMax !== ""
			? { qtyMax: Number(filterValues.qtyMax) }
			: {}),
		...(sortBy ? { sortBy, sortOrder } : {}),
		page,
	});

	const approveInstallations = useApproveInstallations();
	const denyInstallation = useDenyInstallation();
	const updatePending = useUpdatePendingInstallation();

	// Active chips: derived from filterValues so the toolbar stays in sync.
	const activeChips = useMemo(() => {
		const out: Array<{
			key: string;
			label: string;
			onRemove: () => void;
		}> = [];

		if (filterValues.type !== "all") {
			const label = INSTALLATION_TYPE_OPTIONS.find(
				(o) => o.value === filterValues.type,
			)?.label;
			if (label) {
				out.push({
					key: "type",
					label: `Type: ${label}`,
					onRemove: () => updateFilters({ type: "all" }),
				});
			}
		}
		if (filterValues.employeeId !== "all") {
			const label = employees.find(
				(e) => e.id === filterValues.employeeId,
			)?.name;
			if (label) {
				out.push({
					key: "employeeId",
					label: `Worker: ${label}`,
					onRemove: () => updateFilters({ employeeId: "all" }),
				});
			}
		}
		if (tab === "history" && filterValues.status !== "all") {
			const label = INSTALLATION_STATUS_OPTIONS.find(
				(o) => o.value === filterValues.status,
			)?.label;
			if (label) {
				out.push({
					key: "status",
					label: `Status: ${label}`,
					onRemove: () => updateFilters({ status: "all" }),
				});
			}
		}
		if (filterValues.dateFrom || filterValues.dateTo) {
			out.push({
				key: "date",
				label: `Date: ${filterValues.dateFrom || "…"} – ${filterValues.dateTo || "…"}`,
				onRemove: () => updateFilters({ dateFrom: "", dateTo: "" }),
			});
		}
		if (filterValues.priceMin !== "" || filterValues.priceMax !== "") {
			out.push({
				key: "price",
				label: `Price: ${filterValues.priceMin || "0"} – ${filterValues.priceMax || "∞"}`,
				onRemove: () => updateFilters({ priceMin: "", priceMax: "" }),
			});
		}
		if (filterValues.qtyMin !== "" || filterValues.qtyMax !== "") {
			out.push({
				key: "qty",
				label: `Qty: ${filterValues.qtyMin || "1"} – ${filterValues.qtyMax || "∞"}`,
				onRemove: () => updateFilters({ qtyMin: "", qtyMax: "" }),
			});
		}
		return out;
	}, [filterValues, employees, tab, updateFilters]);

	function getEdit(inst: Installation): RowEdit {
		return (
			edits[inst.id] ?? {
				price: String(inst.price),
				quantity: String(inst.quantity),
			}
		);
	}

	async function handleApprove(inst: Installation) {
		if (!organizationId) {
			return;
		}
		const edit = edits[inst.id];
		try {
			// Commit inline edits first if changed
			if (
				edit &&
				(Number(edit.price) !== inst.price ||
					Number(edit.quantity) !== inst.quantity)
			) {
				await updatePending.mutateAsync({
					organizationId,
					id: inst.id,
					price: Number(edit.price),
					quantity: Number(edit.quantity),
				});
			}
			const { results } = await approveInstallations.mutateAsync({
				organizationId,
				ids: [inst.id],
			});
			const failed = results.find((r) => !r.ok);
			if (failed) {
				toast.error(failed.error ?? "Approval failed");
			} else {
				toast.success("Installation approved");
			}
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Approval failed",
			);
		}
	}

	// biome-ignore lint/correctness/useExhaustiveDependencies: getEdit/handleApprove read the current edits snapshot; edits is in the deps
	const columns = useMemo<ColumnDef<Installation, unknown>[]>(
		() => [
			{
				id: "item",
				header: "Item",
				enableSorting: false,
				meta: { className: "min-w-[220px]" },
				cell: ({ row }) => {
					const inst = row.original;
					const resolution = taskResolution(inst);
					const preview = [
						installationNote(inst),
						resolution?.note ?? resolution?.label,
					]
						.filter(Boolean)
						.join("\n\n");
					return (
						<div className="flex items-center gap-3">
							<MediaThumb inst={inst} onView={setPhoto} />
							<div className="min-w-0 space-y-0.5">
								<div className="flex min-w-0 items-center gap-1.5">
									<p className="truncate font-medium text-sm">
										{installationName(inst)}
									</p>
									{hasNotes(inst) && (
										<Tooltip>
											<TooltipTrigger asChild>
												<button
													type="button"
													onClick={() =>
														setNotesFor(inst)
													}
													className="inline-flex shrink-0"
													aria-label="View notes"
												>
													<StickyNoteIcon className="size-3.5 text-amber-600 dark:text-amber-400" />
												</button>
											</TooltipTrigger>
											<TooltipContent className="max-w-xs whitespace-pre-wrap">
												{preview}
											</TooltipContent>
										</Tooltip>
									)}
								</div>
								<div className="flex items-center gap-1.5">
									<Badge
										variant="outline"
										className="px-1.5 py-0 text-[10px]"
									>
										{installationKind(inst)}
									</Badge>
									{inst.quantity > 1 && (
										<span className="text-muted-foreground text-xs tabular-nums">
											×{inst.quantity}
										</span>
									)}
									{inst.setupRequestId && (
										<Tooltip>
											<TooltipTrigger asChild>
												<span className="inline-flex shrink-0">
													<PackageIcon className="size-3 text-muted-foreground" />
												</span>
											</TooltipTrigger>
											<TooltipContent>
												Part of a new-customer setup
												bundle
											</TooltipContent>
										</Tooltip>
									)}
									{inst.task?.completionPhotoUrl && (
										<ImageIcon className="size-3 text-muted-foreground" />
									)}
								</div>
							</div>
						</div>
					);
				},
			},
			{
				id: "target",
				header: "Installed for",
				enableSorting: false,
				cell: ({ row }) => {
					const inst = row.original;
					if (inst.customer) {
						const name =
							[inst.customer.firstName, inst.customer.lastName]
								.filter(Boolean)
								.join(" ") || inst.customer.username;
						const meta = [
							`#${inst.customer.accountNumber}`,
							inst.customer.username
								? `@${inst.customer.username}`
								: null,
						].filter(Boolean) as string[];
						return (
							<div className="min-w-0">
								<Link
									to="/app/$organizationSlug/customers/$customerId"
									params={{
										organizationSlug,
										customerId: inst.customer.id,
									}}
									className="text-sm font-medium hover:underline"
									preload="intent"
								>
									{name}
								</Link>
								<p className="truncate font-mono text-xs text-muted-foreground">
									{meta.join(" · ")}
								</p>
								{inst.customer.address && (
									<p className="line-clamp-1 max-w-52 text-xs text-muted-foreground">
										{inst.customer.address}
									</p>
								)}
							</div>
						);
					}
					if (inst.station) {
						return (
							<span className="text-sm">
								{inst.station.name}{" "}
								<span className="text-xs text-muted-foreground">
									(station)
								</span>
							</span>
						);
					}
					if (inst.base) {
						return (
							<span className="text-sm">
								{inst.base.name}{" "}
								<span className="text-xs text-muted-foreground">
									(base)
								</span>
							</span>
						);
					}
					return (
						<span className="text-muted-foreground">&mdash;</span>
					);
				},
			},
			{
				id: "worker",
				header: "Worker",
				enableSorting: false,
				meta: { className: "hidden lg:table-cell whitespace-nowrap" },
				cell: ({ row }) => (
					<span className="text-sm">
						{row.original.employee.name}
					</span>
				),
			},
			{
				id: "quantity",
				header: "Qty",
				enableSorting: true,
				meta: { className: "whitespace-nowrap" },
				cell: ({ row }) => {
					const inst = row.original;
					if (inst.status !== "PENDING") {
						return (
							<span className="font-mono text-sm tabular-nums">
								{inst.quantity}
							</span>
						);
					}
					return (
						<PermissionGate
							resource="installations"
							action="approve"
							fallback={
								<span className="font-mono text-sm tabular-nums">
									{inst.quantity}
								</span>
							}
						>
							<Input
								type="number"
								min={1}
								className="h-8 w-16 font-mono"
								value={getEdit(inst).quantity}
								onChange={(e) =>
									setEdits((prev) => ({
										...prev,
										[inst.id]: {
											...getEdit(inst),
											quantity: e.target.value,
										},
									}))
								}
							/>
						</PermissionGate>
					);
				},
			},
			{
				id: "price",
				header: "Price",
				enableSorting: true,
				meta: { className: "whitespace-nowrap" },
				cell: ({ row }) => {
					const inst = row.original;
					if (inst.status !== "PENDING") {
						return (
							<span className="font-mono text-sm tabular-nums">
								{formatCurrency(inst.price)}
							</span>
						);
					}
					return (
						<PermissionGate
							resource="installations"
							action="approve"
							fallback={
								<span className="font-mono text-sm tabular-nums">
									{formatCurrency(inst.price)}
								</span>
							}
						>
							<Input
								type="number"
								min={0}
								step="0.01"
								className="h-8 w-24 font-mono"
								value={getEdit(inst).price}
								onChange={(e) =>
									setEdits((prev) => ({
										...prev,
										[inst.id]: {
											...getEdit(inst),
											price: e.target.value,
										},
									}))
								}
							/>
						</PermissionGate>
					);
				},
			},
			{
				id: "total",
				header: "Total",
				enableSorting: false,
				meta: {
					className:
						"hidden sm:table-cell whitespace-nowrap text-right",
				},
				cell: ({ row }) => {
					const inst = row.original;
					// Reflect uncommitted inline edits so the reviewer sees the
					// amount that would be approved.
					const edit =
						inst.status === "PENDING" ? edits[inst.id] : undefined;
					const price = edit ? Number(edit.price) : inst.price;
					const qty = edit ? Number(edit.quantity) : inst.quantity;
					const totalValue =
						Number.isFinite(price) && Number.isFinite(qty)
							? price * qty
							: inst.price * inst.quantity;
					return (
						<span className="font-mono text-sm font-medium tabular-nums">
							{formatCurrency(totalValue)}
						</span>
					);
				},
			},
			{
				id: "installedAt",
				header: "Date",
				enableSorting: true,
				meta: { className: "hidden md:table-cell whitespace-nowrap" },
				cell: ({ row }) => (
					<div className="flex flex-col leading-tight">
						<span className="whitespace-nowrap text-sm tabular-nums">
							{formatDate(row.original.installedAt, {
								dateStyle: "medium",
							})}
						</span>
						<span className="text-xs text-muted-foreground">
							{relativeAgo(row.original.installedAt)}
						</span>
					</div>
				),
			},
			...(tab === "history"
				? [
						{
							id: "status",
							header: "Status",
							enableSorting: false,
							cell: ({ row }) => {
								const inst = row.original;
								const cfg =
									STATUS_BADGES[
										inst.status as InstallationStatus
									];
								return (
									<div className="space-y-1">
										<Badge variant={cfg.variant}>
											{cfg.label}
										</Badge>
										{inst.approvedBy && (
											<p className="text-muted-foreground text-xs">
												by {inst.approvedBy.name}
												{inst.approvedAt
													? ` · ${formatDate(inst.approvedAt, { dateStyle: "medium" })}`
													: ""}
											</p>
										)}
									</div>
								);
							},
						} satisfies ColumnDef<Installation, unknown>,
					]
				: [
						{
							id: "actions",
							enableSorting: false,
							meta: {
								className:
									"w-[1%] whitespace-nowrap text-right",
							},
							cell: ({ row }) => {
								const inst = row.original;
								return (
									<PermissionGate
										resource="installations"
										action="approve"
									>
										<div className="flex justify-end gap-1.5">
											<Button
												size="sm"
												disabled={
													approveInstallations.isPending
												}
												onClick={() =>
													handleApprove(inst)
												}
											>
												<CheckIcon className="mr-1 size-3.5" />
												Approve
											</Button>
											<Button
												size="sm"
												variant="outline"
												disabled={
													denyInstallation.isPending
												}
												onClick={async () => {
													if (!organizationId) {
														return;
													}
													try {
														await denyInstallation.mutateAsync(
															{
																organizationId,
																id: inst.id,
															},
														);
														toast.success(
															"Installation denied",
														);
													} catch (error) {
														toast.error(
															error instanceof
																Error
																? error.message
																: "Failed to deny",
														);
													}
												}}
											>
												<XIcon className="mr-1 size-3.5" />
												Deny
											</Button>
										</div>
									</PermissionGate>
								);
							},
						} satisfies ColumnDef<Installation, unknown>,
					]),
		],
		// react-doctor-disable-next-line react-doctor/exhaustive-deps -- getEdit/handleApprove only close over reactive values already in deps (edits, organizationId, approveInstallations); listing the per-render function identities would rebuild columns every render and defeat the memo
		[
			tab,
			edits,
			organizationId,
			organizationSlug,
			approveInstallations,
			denyInstallation,
		],
	);

	return (
		<PageShell
			title="Installations"
			description="Review equipment and add-on installations submitted by field workers."
		>
			<ContentCard>
				<ContentCardToolbar
					actions={
						<>
							<InstallationFilters
								value={filterValues}
								onChange={updateFilters}
								onReset={resetFilters}
								activeCount={activeChips.length}
								employees={employees}
								showStatus={tab === "history"}
							/>
							<TableColumnsToggle
								columns={
									TOGGLEABLE_COLUMNS as unknown as Array<{
										id: string;
										label: string;
										alwaysVisible?: boolean;
									}>
								}
								value={columnVisibility}
								onChange={setColumnVisibility}
							/>
						</>
					}
				>
					<Tabs
						value={tab}
						onValueChange={(v) => {
							setTab(v as "pending" | "history");
							setPage(1);
						}}
					>
						<TabsList>
							<TabsTrigger value="pending">
								Pending
								{tab === "pending" && total > 0 && (
									<Badge variant="info" className="ml-1.5">
										{total}
									</Badge>
								)}
							</TabsTrigger>
							<TabsTrigger value="history">History</TabsTrigger>
						</TabsList>
					</Tabs>
					{tab === "pending" && pendingValue > 0 && (
						<span className="whitespace-nowrap text-xs text-muted-foreground">
							{formatCurrency(pendingValue)} awaiting approval
						</span>
					)}
					<SearchInput
						placeholder="Search customer, item, station, base, notes…"
						hint="Searches customer name, username, stock item, station, base and notes"
						value={search}
						onChange={(v) => {
							setSearch(v);
							setPage(1);
						}}
					/>
				</ContentCardToolbar>

				{activeChips.length > 0 && (
					<div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-surface-subtle/40 px-3 py-2 md:px-4">
						{activeChips.map((chip) => (
							<Badge
								key={chip.key}
								variant="secondary"
								className="gap-1 py-1 pl-2 pr-1 font-normal"
							>
								<span className="text-xs">{chip.label}</span>
								<button
									type="button"
									onClick={chip.onRemove}
									className="inline-flex size-4 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
									aria-label={`Remove ${chip.label}`}
								>
									<XIcon className="size-3" />
								</button>
							</Badge>
						))}
						<Button
							variant="ghost"
							size="sm"
							className="h-6 px-2 text-xs text-muted-foreground"
							onClick={resetFilters}
						>
							Clear all
						</Button>
					</div>
				)}

				<DataTable
					columns={columns}
					data={installations}
					sorting={sorting}
					onSortingChange={onSortingChange}
					columnVisibility={columnVisibility}
					onColumnVisibilityChange={setColumnVisibility}
					pagination={{
						totalItems: total,
						currentPage: page,
						itemsPerPage: PAGE_SIZE,
						onPageChange: setPage,
					}}
					isFetching={isFetching}
					getRowId={(row) => row.id}
					renderSubRow={(row) => (
						<InstallationSubRow
							inst={row.original}
							organizationSlug={organizationSlug}
							onViewPhoto={setPhoto}
						/>
					)}
					emptyState={
						<EmptyState
							icon={WrenchIcon}
							title={
								tab === "pending"
									? "No pending installations"
									: "No installations found"
							}
							description={
								tab === "pending"
									? "Worker installation submissions will appear here for approval."
									: "Try adjusting your filters."
							}
						/>
					}
				/>
			</ContentCard>

			{notesFor && (
				<InstallationNotesDialog
					inst={notesFor}
					onClose={() => setNotesFor(null)}
				/>
			)}

			{photo && (
				<ImageViewerDialog
					open={!!photo}
					onOpenChange={(open) => {
						if (!open) {
							setPhoto(null);
						}
					}}
					src={photo.src}
					title={photo.title}
				/>
			)}
		</PageShell>
	);
}
