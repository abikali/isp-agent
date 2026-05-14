"use client";

import type { CustomerListStatus } from "@repo/api/modules/customers/lib/statuses";
import { useCollectors, useCustomerGroups } from "@saas/billing/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import {
	ContentCard,
	ContentCardToolbar,
} from "@shared/components/ContentCard";
import { EmptyState } from "@shared/components/EmptyState";
import { PageShell } from "@shared/components/PageShell";
import { SearchInput } from "@shared/components/SearchInput";
import { SyncPreviewDialog } from "@shared/components/SyncPreviewDialog";
import { TableColumnsToggle } from "@shared/components/TableColumnsToggle";
import { usePersistedColumnVisibility } from "@shared/hooks/use-persisted-column-visibility";
import { useServerSorting } from "@shared/hooks/use-server-sorting";
import { displayName } from "@shared/lib/display-name";
import { formatDate } from "@shared/lib/format";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { useIsFetching, useQuery } from "@tanstack/react-query";
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
import { ConnectivityCell } from "./ConnectivityCell";
import { CreateCustomerDialog } from "./CreateCustomerDialog";
import { CustomerBulkActionsBar } from "./CustomerBulkActionsBar";
import { CustomerFilters, type CustomerFiltersValue } from "./CustomerFilters";
import { CustomerRowActions } from "./CustomerRowActions";
import { CustomerStats } from "./CustomerStats";
import { CustomerStatsSkeleton } from "./CustomerStatsSkeleton";
import { ImportFromIRadiusDialog } from "./ImportFromIRadiusDialog";
import { NetworkCell } from "./NetworkCell";
import { UsageCell } from "./UsageCell";

function getInitials(first: string | null, last: string | null): string {
	const f = first?.trim()?.[0] ?? "";
	const l = last?.trim()?.[0] ?? "";
	const out = `${f}${l}`.toUpperCase();
	return out || "?";
}

// Header for the "Usage today" column. Renders a tiny green dot that pulses
// when the customers list query is refetching — signals that this column is
// kept fresh from the 15s iRadius usage sync.
function UsageHeader() {
	const isRefreshing =
		useIsFetching({ queryKey: orpc.customers.list.key() }) > 0;
	return (
		<span className="inline-flex items-center gap-1.5">
			<span
				aria-hidden="true"
				className={cn(
					"size-1.5 rounded-full bg-success",
					isRefreshing && "animate-pulse",
				)}
				title={isRefreshing ? "Refreshing…" : "Live"}
			/>
			Usage today
		</span>
	);
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
	monthlyRate: "monthlyRate",
} as const satisfies Record<string, string>;

const TOGGLEABLE_COLUMNS = [
	{ id: "name", label: "Customer", alwaysVisible: true },
	{ id: "status", label: "Status" },
	{ id: "plan", label: "Plan" },
	{ id: "assignment", label: "Assignment" },
	{ id: "usage", label: "Usage today" },
	{ id: "network", label: "Network" },
	{ id: "expiry", label: "Expiry" },
	{ id: "monthlyRate", label: "Rate" },
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
	plan: {
		name: string;
		monthlyPrice: number;
		monthlyQuota: number | null;
		dailyQuotaDown: number | null;
		dailyQuotaUp: number | null;
		combinedMaxUpAndDown: number | null;
	} | null;
	station: { name: string } | null;
	collector: { id: string; name: string } | null;
	connectionType: string | null;
	monthlyRate: number | null;
	balance: number;
	discount: number;
	iptvPrice: number;
	latitude: number | null;
	longitude: number | null;
	locationRequestedAt: Date | string | null;
	expiresAt: Date | string | null;
	lastLogin: Date | string | null;
	ipAddress: string | null;
	macAddress: string | null;
	nasHost: string | null;
	fupMode: string | null;
	downloadBytes: bigint | number | null;
	uploadBytes: bigint | number | null;
	dailyDownloadBytes: bigint | number | null;
	dailyUploadBytes: bigint | number | null;
	lastUsageSyncAt: Date | string | null;
	cycleStartedAt: Date | string | null;
	cycleStartDownloadBytes: bigint | number | null;
	cycleStartUploadBytes: bigint | number | null;
	reachMaxQuota: boolean;
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
				meta: { className: "whitespace-nowrap w-[1%] text-center" },
				cell: ({ row }) => (
					<ConnectivityCell
						status={
							row.original.status as
								| "ACTIVE"
								| "INACTIVE"
								| "SUSPENDED"
								| "PENDING"
						}
						online={row.original.online}
						lastLogin={row.original.lastLogin}
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
				id: "usage",
				header: () => <UsageHeader />,
				enableSorting: false,
				meta: {
					className: "hidden xl:table-cell whitespace-nowrap",
				},
				cell: ({ row }) => (
					<UsageCell
						dailyDown={
							typeof row.original.dailyDownloadBytes === "bigint"
								? Number(row.original.dailyDownloadBytes)
								: (row.original.dailyDownloadBytes ?? 0)
						}
						dailyUp={
							typeof row.original.dailyUploadBytes === "bigint"
								? Number(row.original.dailyUploadBytes)
								: (row.original.dailyUploadBytes ?? 0)
						}
						totalDown={
							typeof row.original.downloadBytes === "bigint"
								? Number(row.original.downloadBytes)
								: (row.original.downloadBytes ?? 0)
						}
						totalUp={
							typeof row.original.uploadBytes === "bigint"
								? Number(row.original.uploadBytes)
								: (row.original.uploadBytes ?? 0)
						}
						cycleStartDown={
							typeof row.original.cycleStartDownloadBytes ===
							"bigint"
								? Number(row.original.cycleStartDownloadBytes)
								: (row.original.cycleStartDownloadBytes ?? 0)
						}
						cycleStartUp={
							typeof row.original.cycleStartUploadBytes ===
							"bigint"
								? Number(row.original.cycleStartUploadBytes)
								: (row.original.cycleStartUploadBytes ?? 0)
						}
						cycleStartedAt={row.original.cycleStartedAt}
						monthlyQuotaGb={row.original.plan?.monthlyQuota ?? null}
						dailyQuotaDownGb={
							row.original.plan?.dailyQuotaDown ?? null
						}
						dailyQuotaUpGb={row.original.plan?.dailyQuotaUp ?? null}
						combinedDailyQuotaGb={
							row.original.plan?.combinedMaxUpAndDown ?? null
						}
						reachMaxQuota={row.original.reachMaxQuota}
						fupMode={row.original.fupMode}
						lastUsageSyncAt={row.original.lastUsageSyncAt}
					/>
				),
			},
			{
				id: "network",
				header: "Network",
				enableSorting: false,
				meta: {
					className: "hidden xl:table-cell whitespace-nowrap",
				},
				cell: ({ row }) => (
					<NetworkCell
						ipAddress={row.original.ipAddress}
						macAddress={row.original.macAddress}
						nasHost={row.original.nasHost}
					/>
				),
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
				id: "monthlyRate",
				header: "Rate",
				accessorFn: (row) =>
					row.monthlyRate ?? row.plan?.monthlyPrice ?? 0,
				enableSorting: true,
				meta: {
					className:
						"hidden sm:table-cell text-right whitespace-nowrap w-[1%]",
				},
				cell: ({ row }) => {
					// Customer's effective rate = override on the customer
					// (monthlyRate) or the plan's price as fallback.
					const override = row.original.monthlyRate;
					const planPrice = row.original.plan?.monthlyPrice ?? null;
					const value = override ?? planPrice;
					if (value == null) {
						return <span className="text-muted-foreground">—</span>;
					}
					return (
						<span className="inline-flex items-baseline gap-1">
							<span className="font-mono text-sm tabular-nums">
								${value.toFixed(2)}
							</span>
							<span className="text-[10px] text-muted-foreground">
								/mo
							</span>
						</span>
					);
				},
			},
			{
				id: "actions",
				header: "Actions",
				enableSorting: false,
				meta: { className: "w-[1%] whitespace-nowrap text-right" },
				cell: ({ row }) => (
					<CustomerRowActions
						customerId={row.original.id}
						customerName={
							displayName(
								row.original.firstName,
								row.original.lastName,
							) || row.original.accountNumber
						}
						customerStatus={row.original.status}
						hasExternalId={!!row.original.externalId}
						organizationSlug={organizationSlug}
						organizationId={organizationId}
						hasLocation={
							row.original.latitude != null &&
							row.original.longitude != null
						}
						onRequestLocation={() =>
							handleRequestClick(row.original)
						}
						customerFirstName={row.original.firstName}
						customerLastName={row.original.lastName}
						customerDiscount={row.original.discount}
						customerIptvPrice={row.original.iptvPrice}
						customerExpiresAt={row.original.expiresAt}
					/>
				),
			},
		],
		[organizationSlug, organizationId, handleRequestClick],
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

			{selectedCount > 0 && (
				<CustomerBulkActionsBar
					count={selectedCount}
					customerIds={selectedIds}
					organizationId={organizationId}
					collectors={collectors}
					onCleared={() => setRowSelection({})}
					onSyncFromIRadius={() => setDialog("sync-preview")}
					onRequestLocation={() => setDialog("bulk-request")}
					requestLocationDisabled={bulkRequestLocation.isPending}
				/>
			)}

			<ContentCard>
				<ContentCardToolbar
					actions={
						<>
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
						</>
					}
				>
					<SearchInput
						placeholder="Search name, account, phone, email, IP, MAC, address…"
						hint="Searches name, account, username, email, phone, address, IP, MAC, plan, station, collector, group, notes, MOF and external ID"
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
			</ContentCard>

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
