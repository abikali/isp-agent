"use client";

import type { CustomerListStatus } from "@repo/api/modules/customers/lib/statuses";
import { useCollectors, useCustomerGroups } from "@saas/billing/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { EmptyState } from "@shared/components/EmptyState";
import { PageShell } from "@shared/components/PageShell";
import { SearchInput } from "@shared/components/SearchInput";
import { StatusIndicator } from "@shared/components/StatusIndicator";
import { SyncPreviewDialog } from "@shared/components/SyncPreviewDialog";
import { TableColumnsToggle } from "@shared/components/TableColumnsToggle";
import { usePersistedColumnVisibility } from "@shared/hooks/use-persisted-column-visibility";
import { useServerSorting } from "@shared/hooks/use-server-sorting";
import { displayName } from "@shared/lib/display-name";
import { formatDate } from "@shared/lib/format";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
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
import { Avatar, AvatarFallback } from "@ui/components/avatar";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { DataTable } from "@ui/components/data-table";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@ui/components/tooltip";
import { cn } from "@ui/lib";
import {
	DownloadIcon,
	MapPinIcon,
	PlusIcon,
	RefreshCwIcon,
	StickyNoteIcon,
	UploadIcon,
	UsersIcon,
	XIcon,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
	useBulkRequestLocation,
	useCreateLocationRequest,
	useCustomers,
} from "../hooks/use-customers";
import { usePlansQuery } from "../hooks/use-plans";
import { useStationsQuery } from "../hooks/use-stations";
import {
	CONNECTION_TYPE_LABELS,
	CONNECTION_TYPE_OPTIONS,
	CUSTOMER_STATUS_OPTIONS,
} from "../lib/constants";
import {
	formatLocationRequestAge,
	isLocationRequestRecent,
} from "../lib/location-utils";
import { BulkExportButton } from "./BulkExportButton";
import { BulkImportDialog } from "./BulkImportDialog";
import { CreateCustomerDialog } from "./CreateCustomerDialog";
import { CustomerFilters, type CustomerFiltersValue } from "./CustomerFilters";
import { CustomerRowActions } from "./CustomerRowActions";
import { CustomerStats } from "./CustomerStats";
import { CustomerStatsSkeleton } from "./CustomerStatsSkeleton";
import { ImportFromIRadiusDialog } from "./ImportFromIRadiusDialog";

function getConnectivityStatus(
	customerStatus: string,
	online: boolean,
): "online" | "offline" | "inactive" {
	if (customerStatus !== "ACTIVE") {
		return "inactive";
	}
	return online ? "online" : "offline";
}

function getInitials(first: string | null, last: string | null): string {
	const f = first?.trim()?.[0] ?? "";
	const l = last?.trim()?.[0] ?? "";
	const out = `${f}${l}`.toUpperCase();
	return out || "?";
}

function formatRelativeFromNow(value: Date | string): {
	text: string;
	expired: boolean;
} {
	const target = new Date(value).getTime();
	const now = Date.now();
	const diffMs = target - now;
	const expired = diffMs < 0;
	const absMs = Math.abs(diffMs);
	const day = 1000 * 60 * 60 * 24;
	const days = Math.round(absMs / day);
	if (days === 0) {
		return { text: "today", expired };
	}
	if (days < 30) {
		return {
			text: expired ? `${days}d ago` : `in ${days}d`,
			expired,
		};
	}
	const months = Math.round(days / 30);
	if (months < 12) {
		return {
			text: expired ? `${months}mo ago` : `in ${months}mo`,
			expired,
		};
	}
	const years = Math.round(months / 12);
	return {
		text: expired ? `${years}y ago` : `in ${years}y`,
		expired,
	};
}

const PAGE_SIZE = 25;

const sortByMap = {
	name: "lastName",
	status: "status",
	expiry: "expiresAt",
	balance: "balance",
} as const satisfies Record<string, string>;

const TOGGLEABLE_COLUMNS = [
	{ id: "name", label: "Customer", alwaysVisible: true },
	{ id: "status", label: "Status" },
	{ id: "plan", label: "Plan" },
	{ id: "assignment", label: "Assignment" },
	{ id: "expiry", label: "Expiry" },
	{ id: "balance", label: "Balance" },
] as const;

const DEFAULT_FILTERS: CustomerFiltersValue = {
	status: "all",
	planId: "all",
	stationId: "all",
	connectionType: "all",
	groupName: "all",
	collectorId: "all",
	hasLocation: "all",
};

interface CustomerRow {
	id: string;
	status: string;
	online: boolean;
	accountNumber: string;
	username: string | null;
	firstName: string | null;
	lastName: string | null;
	email: string | null;
	groupName: string | null;
	externalId: string | null;
	plan: { name: string } | null;
	station: { name: string } | null;
	collector: { id: string; name: string } | null;
	connectionType: string | null;
	balance: number;
	latitude: number | null;
	longitude: number | null;
	locationRequestedAt: Date | string | null;
	expiresAt: Date | string | null;
	notes: string | null;
}

export function CustomersList({
	organizationSlug,
}: {
	organizationSlug: string;
}) {
	const maybeOrganizationId = useOrganizationId();
	// The `_org/$organizationSlug` route's `beforeLoad` guard guarantees an
	// org is loaded before this component mounts. Surface a hard error if
	// we ever render outside that guard instead of silently no-op'ing.
	if (!maybeOrganizationId) {
		throw new Error(
			"CustomersList rendered outside an org-scoped route — beforeLoad guard failed",
		);
	}
	const organizationId: string = maybeOrganizationId;
	const { data: iradiusStatus } = useQuery(
		organizationId
			? orpc.organizations.getIradiusStatus.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["organizations", "getIradiusStatus"]),
	);
	const iradiusEnabled = !iradiusStatus?.iradiusDisabled;

	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 300 });
	const [filterValues, setFilterValues] =
		useState<CustomerFiltersValue>(DEFAULT_FILTERS);
	const [page, setPage] = useState(1);
	const { sorting, sortBy, sortOrder, onSortingChange } = useServerSorting(
		sortByMap,
		() => setPage(1),
	);
	const [columnVisibility, setColumnVisibility] =
		usePersistedColumnVisibility("customers");
	const [dialog, setDialog] = useState<
		| "create"
		| "import"
		| "iradius-import"
		| "sync-preview"
		| "bulk-request"
		| null
	>(null);
	const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
	const [reRequestConfirm, setReRequestConfirm] = useState<{
		customerId: string;
		label: string;
	} | null>(null);

	const createLocationRequest = useCreateLocationRequest();
	const bulkRequestLocation = useBulkRequestLocation();

	// Fetched solely to label active filter chips.
	const { plans } = usePlansQuery();
	const { stations } = useStationsQuery();
	const { groups } = useCustomerGroups();
	const { data: collectorsData } = useCollectors();
	const collectors = collectorsData?.collectors ?? [];

	const selectedIds = useMemo(
		() => Object.keys(rowSelection),
		[rowSelection],
	);
	const selectedCount = selectedIds.length;

	const updateFilters = useCallback(
		(patch: Partial<CustomerFiltersValue>) => {
			setFilterValues((prev) => ({ ...prev, ...patch }));
			setPage(1);
		},
		[],
	);
	const resetFilters = useCallback(() => {
		setFilterValues(DEFAULT_FILTERS);
		setPage(1);
	}, []);

	const sendLocationRequest = useCallback(
		(customerId: string) => {
			createLocationRequest.mutate(
				{ organizationId, customerId },
				{
					onSuccess: (result) => {
						if (result.whatsappSent) {
							toast.success("Location request sent on WhatsApp");
						} else {
							toast.warning(
								"Link created but WhatsApp send failed",
							);
						}
					},
					onError: (err) => toast.error(err.message),
				},
			);
		},
		[organizationId, createLocationRequest],
	);

	const handleRequestClick = useCallback(
		(row: CustomerRow) => {
			if (isLocationRequestRecent(row.locationRequestedAt)) {
				setReRequestConfirm({
					customerId: row.id,
					label:
						formatLocationRequestAge(row.locationRequestedAt) ??
						"recently",
				});
				return;
			}
			sendLocationRequest(row.id);
		},
		[sendLocationRequest],
	);

	function doBulkRequest() {
		if (selectedIds.length === 0) {
			return;
		}
		bulkRequestLocation.mutate(
			{ organizationId, customerIds: selectedIds },
			{
				onSuccess: (result) => {
					toast.success(
						`Queued ${result.queued} request${result.queued === 1 ? "" : "s"} — delivery in progress`,
					);
					setRowSelection({});
					setDialog(null);
				},
				onError: (err) => toast.error(err.message),
			},
		);
	}

	const filters = {
		search: debouncedSearch || undefined,
		status:
			filterValues.status !== "all"
				? (filterValues.status as CustomerListStatus)
				: undefined,
		planId: filterValues.planId !== "all" ? filterValues.planId : undefined,
		stationId:
			filterValues.stationId !== "all"
				? filterValues.stationId
				: undefined,
		connectionType:
			filterValues.connectionType !== "all"
				? (filterValues.connectionType as
						| "FIBER"
						| "WIRELESS"
						| "DSL"
						| "CABLE"
						| "ETHERNET")
				: undefined,
		groupName:
			filterValues.groupName !== "all"
				? filterValues.groupName
				: undefined,
		collectorId:
			filterValues.collectorId !== "all"
				? filterValues.collectorId
				: undefined,
		hasLocation:
			filterValues.hasLocation !== "all"
				? filterValues.hasLocation
				: undefined,
		page,
		sortBy,
		sortOrder,
	};

	const { customers, total, isLoading, isFetching } = useCustomers(filters);

	// Active chips: derived from filterValues so the toolbar stays in sync.
	const activeChips = useMemo(() => {
		const out: Array<{
			key: keyof CustomerFiltersValue;
			label: string;
			onRemove: () => void;
		}> = [];

		if (filterValues.status !== "all") {
			const label = CUSTOMER_STATUS_OPTIONS.find(
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
		if (filterValues.planId !== "all") {
			const label = plans.find((p) => p.id === filterValues.planId)?.name;
			if (label) {
				out.push({
					key: "planId",
					label: `Plan: ${label}`,
					onRemove: () => updateFilters({ planId: "all" }),
				});
			}
		}
		if (filterValues.stationId !== "all") {
			const label = stations.find(
				(s) => s.id === filterValues.stationId,
			)?.name;
			if (label) {
				out.push({
					key: "stationId",
					label: `Station: ${label}`,
					onRemove: () => updateFilters({ stationId: "all" }),
				});
			}
		}
		if (filterValues.groupName !== "all") {
			out.push({
				key: "groupName",
				label: `Group: ${filterValues.groupName}`,
				onRemove: () => updateFilters({ groupName: "all" }),
			});
		}
		if (filterValues.collectorId !== "all") {
			const label =
				filterValues.collectorId === "none"
					? "Unassigned"
					: collectors.find((c) => c.id === filterValues.collectorId)
							?.name;
			if (label) {
				out.push({
					key: "collectorId",
					label: `Collector: ${label}`,
					onRemove: () => updateFilters({ collectorId: "all" }),
				});
			}
		}
		if (filterValues.connectionType !== "all") {
			const label = CONNECTION_TYPE_OPTIONS.find(
				(o) => o.value === filterValues.connectionType,
			)?.label;
			if (label) {
				out.push({
					key: "connectionType",
					label: `Connection: ${label}`,
					onRemove: () => updateFilters({ connectionType: "all" }),
				});
			}
		}
		if (filterValues.hasLocation !== "all") {
			out.push({
				key: "hasLocation",
				label:
					filterValues.hasLocation === "yes"
						? "Has location"
						: "Missing location",
				onRemove: () => updateFilters({ hasLocation: "all" }),
			});
		}
		// groups param is referenced for parity with filter source; not used
		// for chip labels but listed here so eslint sees it.
		void groups;
		return out;
	}, [filterValues, plans, stations, collectors, groups, updateFilters]);

	const activeCount = activeChips.length;

	const columns = useMemo<ColumnDef<CustomerRow, unknown>[]>(
		() => [
			{
				id: "name",
				header: "Customer",
				accessorFn: (row) => row.lastName,
				enableSorting: true,
				meta: { className: "min-w-[220px]" },
				cell: ({ row }) => {
					const note = row.original.notes?.trim();
					const fullName = displayName(
						row.original.firstName,
						row.original.lastName,
					);
					const initials = getInitials(
						row.original.firstName,
						row.original.lastName,
					);
					const hasLocation =
						row.original.latitude != null &&
						row.original.longitude != null;
					const meta = [
						`#${row.original.accountNumber}`,
						row.original.username
							? `@${row.original.username}`
							: null,
						row.original.email,
					].filter(Boolean) as string[];
					return (
						<div className="flex min-w-0 items-center gap-2.5">
							<Avatar className="size-8 shrink-0 rounded-full">
								<AvatarFallback className="rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
									{initials}
								</AvatarFallback>
							</Avatar>
							<div className="min-w-0 flex-1">
								<div className="flex min-w-0 items-center gap-1.5">
									<Link
										to="/app/$organizationSlug/customers/$customerId"
										params={{
											organizationSlug,
											customerId: row.original.id,
										}}
										className="truncate text-sm font-medium hover:underline"
										preload="intent"
									>
										{fullName}
									</Link>
									{note && (
										<Tooltip>
											<TooltipTrigger asChild>
												<span className="inline-flex shrink-0">
													<StickyNoteIcon className="size-3.5 text-amber-600 dark:text-amber-400" />
												</span>
											</TooltipTrigger>
											<TooltipContent className="max-w-xs whitespace-pre-wrap">
												{note}
											</TooltipContent>
										</Tooltip>
									)}
									{hasLocation ? (
										<Tooltip>
											<TooltipTrigger asChild>
												<span className="inline-flex shrink-0">
													<MapPinIcon className="size-3 text-emerald-600 dark:text-emerald-400" />
												</span>
											</TooltipTrigger>
											<TooltipContent>
												Location captured
											</TooltipContent>
										</Tooltip>
									) : null}
								</div>
								<p className="truncate text-xs text-muted-foreground">
									{meta.map((m, i) => (
										<span key={m}>
											{i > 0 && (
												<span className="mx-1.5 text-muted-foreground/50">
													·
												</span>
											)}
											<span
												className={
													m.startsWith("#") ||
													m.startsWith("@")
														? "font-mono"
														: undefined
												}
											>
												{m}
											</span>
										</span>
									))}
								</p>
							</div>
						</div>
					);
				},
			},
			{
				id: "status",
				header: "Status",
				enableSorting: true,
				meta: { className: "whitespace-nowrap w-[1%]" },
				cell: ({ row }) => (
					<StatusIndicator
						status={getConnectivityStatus(
							row.original.status,
							row.original.online,
						)}
						variant="badge"
						size="sm"
					/>
				),
			},
			{
				id: "plan",
				header: "Plan",
				enableSorting: false,
				meta: {
					className: "hidden md:table-cell whitespace-nowrap",
				},
				cell: ({ row }) => {
					const plan = row.original.plan?.name;
					const conn = row.original.connectionType;
					const group = row.original.groupName;
					if (!plan && !conn && !group) {
						return <span className="text-muted-foreground">—</span>;
					}
					return (
						<div className="flex flex-col gap-1 leading-tight">
							<div className="flex items-center gap-1.5">
								<span className="truncate text-sm">
									{plan ?? (
										<span className="text-muted-foreground">
											No plan
										</span>
									)}
								</span>
								{group && (
									<span className="inline-flex shrink-0 items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
										{group}
									</span>
								)}
							</div>
							{conn && (
								<span className="text-xs text-muted-foreground">
									{CONNECTION_TYPE_LABELS[conn] ?? conn}
								</span>
							)}
						</div>
					);
				},
			},
			{
				id: "assignment",
				header: "Assignment",
				enableSorting: false,
				meta: {
					className: "hidden lg:table-cell whitespace-nowrap",
				},
				cell: ({ row }) => {
					const station = row.original.station?.name;
					const collector = row.original.collector?.name;
					if (!station && !collector) {
						return <span className="text-muted-foreground">—</span>;
					}
					return (
						<div className="flex flex-col leading-tight">
							<span className="truncate text-sm">
								{station ?? (
									<span className="text-muted-foreground">
										No station
									</span>
								)}
							</span>
							<span className="truncate text-xs text-muted-foreground">
								{collector ?? "Unassigned"}
							</span>
						</div>
					);
				},
			},
			{
				id: "expiry",
				header: "Expiry",
				accessorFn: (row) => row.expiresAt,
				enableSorting: true,
				meta: {
					className: "hidden lg:table-cell whitespace-nowrap",
				},
				cell: ({ row }) => {
					const value = row.original.expiresAt;
					if (!value) {
						return <span className="text-muted-foreground">—</span>;
					}
					const { text, expired } = formatRelativeFromNow(value);
					return (
						<Tooltip>
							<TooltipTrigger asChild>
								<div className="flex flex-col leading-tight">
									<span
										className={cn(
											"text-sm",
											expired
												? "font-medium text-red-600 dark:text-red-400"
												: "text-foreground",
										)}
									>
										{formatDate(value)}
									</span>
									<span
										className={cn(
											"text-xs",
											expired
												? "text-red-600/80 dark:text-red-400/80"
												: "text-muted-foreground",
										)}
									>
										{text}
									</span>
								</div>
							</TooltipTrigger>
							<TooltipContent>
								{expired ? "Expired " : "Expires "}
								{formatDate(value)}
							</TooltipContent>
						</Tooltip>
					);
				},
			},
			{
				id: "balance",
				header: "Balance",
				accessorFn: (row) => row.balance,
				enableSorting: true,
				meta: {
					className:
						"hidden sm:table-cell text-right whitespace-nowrap w-[1%]",
				},
				cell: ({ row }) => {
					const balance = row.original.balance;
					const isOwed = balance < 0;
					const isCredit = balance > 0;
					return (
						<span
							className={cn(
								"font-mono text-sm tabular-nums",
								isOwed &&
									"font-semibold text-red-600 dark:text-red-400",
								isCredit &&
									"text-emerald-600 dark:text-emerald-400",
								!isOwed && !isCredit && "text-muted-foreground",
							)}
						>
							${balance.toFixed(2)}
						</span>
					);
				},
			},
			{
				id: "actions",
				enableSorting: false,
				meta: { className: "w-[1%] whitespace-nowrap text-right" },
				cell: ({ row }) => (
					<CustomerRowActions
						customerId={row.original.id}
						organizationSlug={organizationSlug}
						hasLocation={
							row.original.latitude != null &&
							row.original.longitude != null
						}
						onRequestLocation={() =>
							handleRequestClick(row.original)
						}
					/>
				),
			},
		],
		[organizationSlug, handleRequestClick],
	);

	return (
		<PageShell
			title="Customers"
			actions={
				<>
					<BulkExportButton
						filters={{
							status:
								filters.status === "NEEDS_REVIEW"
									? undefined
									: filters.status,
							planId: filters.planId,
							stationId: filters.stationId,
						}}
					/>
					{iradiusEnabled && (
						<Button
							variant="outline"
							onClick={() => setDialog("iradius-import")}
						>
							<DownloadIcon className="mr-2 size-4" />
							Import from iRadius
						</Button>
					)}
					<Button
						variant="outline"
						onClick={() => setDialog("import")}
					>
						<UploadIcon className="mr-2 size-4" />
						Import CSV
					</Button>
					<Button onClick={() => setDialog("create")}>
						<PlusIcon className="mr-2 size-4" />
						Add Customer
					</Button>
				</>
			}
		>
			<AsyncBoundary fallback={<CustomerStatsSkeleton />}>
				<CustomerStats
					activeStatus={filterValues.status}
					onStatusChange={(v) => updateFilters({ status: v })}
				/>
			</AsyncBoundary>

			<div className="space-y-2">
				<div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2 shadow-card">
					<SearchInput
						placeholder="Search name, account, phone, email, IP, MAC, address…"
						hint="Searches name, account, username, email, phone, address, IP, MAC, plan, station, collector, group, notes, MOF and external ID"
						value={search}
						onChange={(v) => {
							setSearch(v);
							setPage(1);
						}}
					/>
					<div className="ml-auto flex items-center gap-2">
						<CustomerFilters
							value={filterValues}
							onChange={updateFilters}
							onReset={resetFilters}
							activeCount={activeCount}
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
					</div>
				</div>

				{activeChips.length > 0 && (
					<div className="flex flex-wrap items-center gap-1.5">
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
			</div>

			{selectedCount > 0 && (
				<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 shadow-card">
					<div className="flex items-center gap-2 text-sm">
						<span className="inline-flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground tabular-nums">
							{selectedCount}
						</span>
						<span className="font-medium">
							{selectedCount === 1
								? "customer selected"
								: "customers selected"}
						</span>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<Button
							size="sm"
							variant="outline"
							onClick={() => setDialog("sync-preview")}
						>
							<RefreshCwIcon className="mr-2 size-4" />
							Sync from iRadius
						</Button>
						<Button
							size="sm"
							variant="outline"
							disabled={bulkRequestLocation.isPending}
							onClick={() => setDialog("bulk-request")}
						>
							<MapPinIcon className="mr-2 size-4" />
							Request location
						</Button>
						<Button
							size="sm"
							variant="ghost"
							onClick={() => setRowSelection({})}
							className="text-muted-foreground"
						>
							Clear
						</Button>
					</div>
				</div>
			)}

			<DataTable
				columns={columns}
				data={customers}
				sorting={sorting}
				onSortingChange={onSortingChange}
				columnVisibility={columnVisibility}
				onColumnVisibilityChange={setColumnVisibility}
				pagination={{
					totalItems: total,
					currentPage: page,
					itemsPerPage: PAGE_SIZE,
					onPageChange: (p) => {
						setPage(p);
						setRowSelection({});
					},
				}}
				isLoading={isLoading}
				isFetching={isFetching}
				enableRowSelection={(row) => !!row.original.externalId}
				rowSelection={rowSelection}
				onRowSelectionChange={setRowSelection}
				getRowId={(row) => row.id}
				emptyState={
					<EmptyState
						icon={UsersIcon}
						title={
							total === 0
								? "No customers yet"
								: "No results found"
						}
						description={
							total === 0
								? "Add your first customer to get started."
								: "Try adjusting your filters or search term."
						}
						action={
							total === 0 ? (
								<Button onClick={() => setDialog("create")}>
									<PlusIcon className="mr-2 size-4" />
									Add Customer
								</Button>
							) : undefined
						}
					/>
				}
			/>

			<CreateCustomerDialog
				open={dialog === "create"}
				onOpenChange={(o) => setDialog(o ? "create" : null)}
			/>
			<BulkImportDialog
				open={dialog === "import"}
				onOpenChange={(o) => setDialog(o ? "import" : null)}
			/>
			<ImportFromIRadiusDialog
				open={dialog === "iradius-import"}
				onOpenChange={(o) => setDialog(o ? "iradius-import" : null)}
			/>
			<SyncPreviewDialog
				open={dialog === "sync-preview"}
				onOpenChange={(o) => setDialog(o ? "sync-preview" : null)}
				entityType="customer"
				entityIds={selectedIds}
				onSynced={() => setRowSelection({})}
			/>

			<AlertDialog
				open={dialog === "bulk-request"}
				onOpenChange={(o) => setDialog(o ? "bulk-request" : null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Request location from {selectedCount} customer
							{selectedCount === 1 ? "" : "s"}?
						</AlertDialogTitle>
						<AlertDialogDescription>
							Each selected customer will receive a WhatsApp
							message with a one-tap link to share their location.
							Customers without a phone number on file will be
							skipped. Sends are sequential to respect rate
							limits.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={doBulkRequest}
							disabled={bulkRequestLocation.isPending}
						>
							{bulkRequestLocation.isPending
								? "Sending…"
								: "Send requests"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog
				open={reRequestConfirm !== null}
				onOpenChange={(o) => !o && setReRequestConfirm(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Re-request location?
						</AlertDialogTitle>
						<AlertDialogDescription>
							You already requested this customer's location{" "}
							{reRequestConfirm?.label}. Send another WhatsApp
							now?
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								const id = reRequestConfirm?.customerId;
								setReRequestConfirm(null);
								if (id) {
									sendLocationRequest(id);
								}
							}}
						>
							Send anyway
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</PageShell>
	);
}
