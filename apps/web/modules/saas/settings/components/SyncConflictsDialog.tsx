"use client";

import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Checkbox } from "@ui/components/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@ui/components/dialog";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/components/table";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@ui/components/tooltip";
import { cn } from "@ui/lib";
import {
	ArrowLeftIcon,
	ArrowRightIcon,
	CheckCircle2Icon,
	DatabaseIcon,
	LoaderIcon,
	MonitorIcon,
	TriangleAlertIcon,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import {
	useBulkResolveSyncConflicts,
	useResolveSyncConflict,
	useSyncConflicts,
	useSyncConflictsSummary,
} from "../../customers/hooks/use-customers";

// ---------------------------------------------------------------------------
// Field labels
// ---------------------------------------------------------------------------

const FIELD_LABELS: Record<string, string> = {
	fullName: "Full Name",
	firstName: "First Name",
	lastName: "Last Name",
	email: "Email",
	mobile: "Mobile",
	phone: "Phone",
	phones: "Phone Numbers",
	address: "Address",
	username: "Username",
	notes: "Notes",
	planId: "Service Plan",
	stationId: "Station",
	accessPointId: "Access Point",
	dealerId: "Dealer",
	collectorId: "Collector",
	nasId: "NAS Server",
	status: "Status",
	connectionType: "Connection Type",
	categoryName: "Category",
	groupName: "Group",
	collectorName: "Collector Name",
	collectorPhone: "Collector Phone",
	mof: "MOF (Tax ID)",
	ipAddress: "IP Address",
	macAddress: "MAC Address",
	staticIp: "Static IP",
	nasHost: "NAS Host",
	mikrotikUser: "MikroTik User",
	mikrotikInterface: "MikroTik Interface",
	mikrotikInterface1: "MikroTik Interface 1",
	mikrotikQueue: "MikroTik Queue",
	wirelessInterface: "Wireless Interface",
	routerBrandPrefix: "Router Brand Prefix",
	monthlyRate: "Monthly Rate",
	discount: "Discount",
	iptvPrice: "IPTV Price",
	realIpPrice: "Real IP Price",
	originalCreatedAt: "Original Created",
	activatedAt: "Activated Date",
	expiresAt: "Expiry Date",
	latitude: "Latitude",
	longitude: "Longitude",
	automaticRenew: "Auto Renew",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConflictField {
	local: string | null;
	remote: string | null;
	resolution: "keep_local" | "keep_remote" | null;
}

type ConflictFields = Record<string, ConflictField>;

/** Flat row = one field from one customer conflict */
interface FlatRow {
	conflictId: string;
	fieldName: string;
	field: ConflictField;
	customer: {
		id: string;
		accountNumber: string;
		fullName: string | null;
		username: string | null;
	};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatValue(val: string | null): string {
	if (val == null) {
		return "\u2014";
	}

	// ISO date strings → human-readable
	if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(val)) {
		const d = new Date(val);
		if (!Number.isNaN(d.getTime())) {
			return d.toLocaleDateString(undefined, {
				year: "numeric",
				month: "short",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit",
			});
		}
	}

	try {
		const parsed = JSON.parse(val);
		if (typeof parsed === "boolean") {
			return parsed ? "Yes" : "No";
		}
		if (Array.isArray(parsed)) {
			return (
				parsed
					.map((p) =>
						typeof p === "object"
							? (p?.number ?? JSON.stringify(p))
							: String(p),
					)
					.join(", ") || "\u2014"
			);
		}
		return String(parsed);
	} catch {
		return val;
	}
}

function truncate(str: string, max: number): string {
	if (str.length <= max) {
		return str;
	}
	return `${str.slice(0, max)}\u2026`;
}

function rowKey(r: FlatRow): string {
	return `${r.conflictId}:${r.fieldName}`;
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

interface SyncConflictsDialogProps {
	organizationId: string;
}

export function SyncConflictsDialog({
	organizationId,
}: SyncConflictsDialogProps) {
	const [open, setOpen] = useState(false);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm" variant="outline">
					<TriangleAlertIcon className="size-4" />
					Review Conflicts
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-6xl max-h-[85vh] flex flex-col p-0">
				{open && <ConflictTable organizationId={organizationId} />}
			</DialogContent>
		</Dialog>
	);
}

// ---------------------------------------------------------------------------
// Conflict Table (inside dialog)
// ---------------------------------------------------------------------------

function ConflictTable({ organizationId }: { organizationId: string }) {
	const [page, setPage] = useState(1);
	const pageSize = 100;

	const { data: summary } = useSyncConflictsSummary(organizationId);
	const {
		data: conflictsData,
		isLoading,
		isFetching,
	} = useSyncConflicts(organizationId, { page, pageSize });

	const resolveMutation = useResolveSyncConflict();
	const bulkMutation = useBulkResolveSyncConflicts();

	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [fieldFilter, setFieldFilter] = useState<string | null>(null);

	const conflicts = conflictsData?.conflicts ?? [];
	const totalCount = conflictsData?.totalCount ?? 0;
	const pendingCount = summary?.pendingCount ?? 0;
	const affectedCustomers = summary?.affectedCustomers ?? 0;
	const totalPages = Math.ceil(totalCount / pageSize);

	// Server-side field counts (across ALL pages)
	const serverFieldCounts = summary?.fieldCounts as
		| Record<string, number>
		| undefined;
	const totalFieldCount = serverFieldCounts
		? Object.values(serverFieldCounts).reduce((a, b) => a + b, 0)
		: pendingCount;

	const allRows: FlatRow[] = useMemo(() => {
		const result: FlatRow[] = [];
		for (const conflict of conflicts) {
			const fields = conflict.fields as unknown as ConflictFields;
			for (const [fieldName, field] of Object.entries(fields)) {
				if (field.resolution !== null) {
					continue;
				}
				result.push({
					conflictId: conflict.id,
					fieldName,
					field,
					customer: conflict.customer,
				});
			}
		}
		return result;
	}, [conflicts]);

	const availableFields = useMemo(() => {
		if (serverFieldCounts) {
			return Object.entries(serverFieldCounts)
				.map(([name, count]) => ({
					name,
					label: FIELD_LABELS[name] ?? name,
					count,
				}))
				.sort((a, b) => a.label.localeCompare(b.label));
		}
		const counts = new Map<string, number>();
		for (const row of allRows) {
			counts.set(row.fieldName, (counts.get(row.fieldName) ?? 0) + 1);
		}
		return [...counts.entries()]
			.map(([name, count]) => ({
				name,
				label: FIELD_LABELS[name] ?? name,
				count,
			}))
			.sort((a, b) => a.label.localeCompare(b.label));
	}, [serverFieldCounts, allRows]);

	const rows = useMemo(
		() =>
			fieldFilter
				? allRows.filter((r) => r.fieldName === fieldFilter)
				: allRows,
		[allRows, fieldFilter],
	);

	const allSelected =
		rows.length > 0 && rows.every((r) => selected.has(rowKey(r)));

	const toggleAll = useCallback(() => {
		if (allSelected) {
			setSelected(new Set());
		} else {
			setSelected(new Set(rows.map(rowKey)));
		}
	}, [allSelected, rows]);

	const toggleRow = useCallback((key: string) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(key)) {
				next.delete(key);
			} else {
				next.add(key);
			}
			return next;
		});
	}, []);

	function resolveSelected(resolution: "keep_local" | "keep_remote") {
		const conflictIds = [
			...new Set(
				[...selected].map((key) => key.split(":")[0]).filter(Boolean),
			),
		] as string[];
		bulkMutation.mutate({ organizationId, resolution, conflictIds });
		setSelected(new Set());
	}

	function resolveAll(resolution: "keep_local" | "keep_remote") {
		bulkMutation.mutate({
			organizationId,
			resolution,
			...(fieldFilter ? { fieldName: fieldFilter } : {}),
		});
		setSelected(new Set());
	}

	function resolveRow(
		row: FlatRow,
		resolution: "keep_local" | "keep_remote",
	) {
		resolveMutation.mutate({
			organizationId,
			conflictId: row.conflictId,
			resolutions: { [row.fieldName]: resolution },
		});
		setSelected((prev) => {
			const next = new Set(prev);
			next.delete(rowKey(row));
			return next;
		});
	}

	const isResolving = resolveMutation.isPending || bulkMutation.isPending;

	return (
		<TooltipProvider delayDuration={200}>
			{/* Header */}
			<DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
				<div className="flex items-center justify-between">
					<div>
						<DialogTitle className="text-lg">
							Sync Conflicts
						</DialogTitle>
						<DialogDescription className="mt-1">
							{pendingCount > 0 ? (
								<>
									<strong>{pendingCount}</strong> field
									{pendingCount !== 1 ? "s" : ""} differ
									across <strong>{affectedCustomers}</strong>{" "}
									customer
									{affectedCustomers !== 1 ? "s" : ""}. Choose
									which version to keep.
								</>
							) : (
								"No pending conflicts."
							)}
						</DialogDescription>
					</div>
					{pendingCount > 0 && (
						<div className="flex items-center gap-2 shrink-0">
							{fieldFilter && (
								<Badge
									variant="secondary"
									className="font-normal text-xs"
								>
									{serverFieldCounts?.[fieldFilter] ??
										rows.length}{" "}
									{FIELD_LABELS[fieldFilter] ?? fieldFilter}
								</Badge>
							)}
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										size="sm"
										variant="outline"
										onClick={() => resolveAll("keep_local")}
										disabled={isResolving}
									>
										{isResolving ? (
											<LoaderIcon className="size-3.5 animate-spin" />
										) : (
											<MonitorIcon className="size-3.5" />
										)}
										<span className="hidden sm:inline">
											{fieldFilter
												? `Keep All Local (${serverFieldCounts?.[fieldFilter] ?? rows.length})`
												: "Keep All Local"}
										</span>
									</Button>
								</TooltipTrigger>
								<TooltipContent>
									{fieldFilter
										? `Keep local values for all ${FIELD_LABELS[fieldFilter] ?? fieldFilter} conflicts`
										: "Discard all iRadius changes, keep your local data"}
								</TooltipContent>
							</Tooltip>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										size="sm"
										variant="outline"
										onClick={() =>
											resolveAll("keep_remote")
										}
										disabled={isResolving}
									>
										{isResolving ? (
											<LoaderIcon className="size-3.5 animate-spin" />
										) : (
											<DatabaseIcon className="size-3.5" />
										)}
										<span className="hidden sm:inline">
											{fieldFilter
												? `Keep All iRadius (${serverFieldCounts?.[fieldFilter] ?? rows.length})`
												: "Keep All iRadius"}
										</span>
									</Button>
								</TooltipTrigger>
								<TooltipContent>
									{fieldFilter
										? `Accept iRadius values for all ${FIELD_LABELS[fieldFilter] ?? fieldFilter} conflicts`
										: "Accept all iRadius values, overwrite local data"}
								</TooltipContent>
							</Tooltip>
						</div>
					)}
				</div>
			</DialogHeader>

			{/* Field filter bar */}
			{availableFields.length > 1 && (
				<div className="px-6 py-2.5 border-b bg-muted/30 shrink-0">
					<div className="flex items-center gap-2 flex-wrap">
						<span className="text-xs font-medium text-muted-foreground shrink-0">
							Filter by field:
						</span>
						<button
							type="button"
							onClick={() => {
								setFieldFilter(null);
								setSelected(new Set());
							}}
							className={cn(
								"inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
								fieldFilter === null
									? "bg-primary text-primary-foreground"
									: "bg-background border hover:bg-muted",
							)}
						>
							All
							<span className="opacity-70">
								({totalFieldCount})
							</span>
						</button>
						{availableFields.map((f) => (
							<button
								key={f.name}
								type="button"
								onClick={() => {
									setFieldFilter(
										fieldFilter === f.name ? null : f.name,
									);
									setSelected(new Set());
								}}
								className={cn(
									"inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
									fieldFilter === f.name
										? "bg-primary text-primary-foreground"
										: "bg-background border hover:bg-muted",
								)}
							>
								{f.label}
								<span className="opacity-70">({f.count})</span>
							</button>
						))}
					</div>
				</div>
			)}

			{/* Table */}
			<div className="flex-1 overflow-auto min-h-0">
				{isLoading ? (
					<div className="flex items-center justify-center py-20">
						<LoaderIcon className="size-6 animate-spin text-muted-foreground" />
					</div>
				) : rows.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
						<CheckCircle2Icon className="size-10 mb-3 text-green-500" />
						<p className="text-lg font-medium">
							No pending conflicts
						</p>
						<p className="text-sm mt-1">
							All data is in sync between local and iRadius.
						</p>
					</div>
				) : (
					<Table>
						<TableHeader>
							<TableRow className="bg-muted/50">
								<TableHead className="w-10 pl-6">
									<Checkbox
										checked={allSelected}
										onCheckedChange={toggleAll}
										aria-label="Select all"
									/>
								</TableHead>
								<TableHead className="min-w-[140px]">
									Customer
								</TableHead>
								<TableHead className="min-w-[120px]">
									Field
								</TableHead>
								<TableHead className="min-w-[140px]">
									<div className="flex items-center gap-1.5">
										<MonitorIcon className="size-3.5 text-muted-foreground" />
										Local Value
									</div>
								</TableHead>
								<TableHead className="min-w-[140px]">
									<div className="flex items-center gap-1.5">
										<DatabaseIcon className="size-3.5 text-muted-foreground" />
										iRadius Value
									</div>
								</TableHead>
								<TableHead className="w-[100px] text-right pr-6">
									Action
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody
							className={
								isFetching
									? "opacity-50 pointer-events-none"
									: ""
							}
						>
							{rows.map((row) => {
								const key = rowKey(row);
								const isSelected = selected.has(key);
								return (
									<TableRow
										key={key}
										data-state={
											isSelected ? "selected" : undefined
										}
										className="group"
									>
										<TableCell className="pl-6">
											<Checkbox
												checked={isSelected}
												onCheckedChange={() =>
													toggleRow(key)
												}
												aria-label={`Select ${row.fieldName}`}
											/>
										</TableCell>
										<TableCell>
											<div className="font-medium text-sm leading-tight">
												{truncate(
													row.customer.fullName ??
														"Unknown",
													24,
												)}
											</div>
											<div className="text-xs text-muted-foreground">
												{row.customer.accountNumber}
											</div>
										</TableCell>
										<TableCell>
											<Badge
												variant="secondary"
												className="font-normal"
											>
												{FIELD_LABELS[row.fieldName] ??
													row.fieldName}
											</Badge>
										</TableCell>
										<TableCell>
											<ValueCell
												value={row.field.local}
											/>
										</TableCell>
										<TableCell>
											<ValueCell
												value={row.field.remote}
											/>
										</TableCell>
										<TableCell className="pr-6">
											<div className="flex items-center justify-end gap-1">
												<Tooltip>
													<TooltipTrigger asChild>
														<Button
															size="sm"
															variant="ghost"
															className="h-7 px-2 text-xs"
															onClick={() =>
																resolveRow(
																	row,
																	"keep_local",
																)
															}
															disabled={
																isResolving
															}
														>
															<MonitorIcon className="size-3.5" />
														</Button>
													</TooltipTrigger>
													<TooltipContent>
														Keep local value
													</TooltipContent>
												</Tooltip>
												<Tooltip>
													<TooltipTrigger asChild>
														<Button
															size="sm"
															variant="ghost"
															className="h-7 px-2 text-xs"
															onClick={() =>
																resolveRow(
																	row,
																	"keep_remote",
																)
															}
															disabled={
																isResolving
															}
														>
															<DatabaseIcon className="size-3.5" />
														</Button>
													</TooltipTrigger>
													<TooltipContent>
														Keep iRadius value
													</TooltipContent>
												</Tooltip>
											</div>
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				)}
			</div>

			{/* Footer */}
			<DialogFooter className="px-6 py-3 border-t shrink-0">
				<div className="flex items-center justify-between w-full">
					{/* Selection actions */}
					<div className="flex items-center gap-2">
						{selected.size > 0 && (
							<>
								<span className="text-sm text-muted-foreground">
									{selected.size} selected
								</span>
								<Button
									size="sm"
									variant="outline"
									onClick={() =>
										resolveSelected("keep_local")
									}
									disabled={isResolving}
								>
									<MonitorIcon className="size-3.5" />
									Keep Local
								</Button>
								<Button
									size="sm"
									variant="outline"
									onClick={() =>
										resolveSelected("keep_remote")
									}
									disabled={isResolving}
								>
									<DatabaseIcon className="size-3.5" />
									Keep iRadius
								</Button>
							</>
						)}
					</div>

					{/* Pagination */}
					<div className="flex items-center gap-2">
						{totalPages > 1 && (
							<>
								<span className="text-sm text-muted-foreground">
									Page {page} of {totalPages}
								</span>
								<Button
									size="sm"
									variant="outline"
									disabled={page <= 1}
									onClick={() => setPage((p) => p - 1)}
								>
									<ArrowLeftIcon className="size-3.5" />
								</Button>
								<Button
									size="sm"
									variant="outline"
									disabled={page >= totalPages}
									onClick={() => setPage((p) => p + 1)}
								>
									<ArrowRightIcon className="size-3.5" />
								</Button>
							</>
						)}
					</div>
				</div>
			</DialogFooter>
		</TooltipProvider>
	);
}

// ---------------------------------------------------------------------------
// Value display cell
// ---------------------------------------------------------------------------

function ValueCell({ value }: { value: string | null }) {
	const display = formatValue(value);
	const isNull = value == null;

	return (
		<div
			className={`text-sm max-w-[200px] ${isNull ? "text-muted-foreground italic" : ""}`}
			title={display.length > 30 ? display : undefined}
		>
			{truncate(display, 40)}
		</div>
	);
}
