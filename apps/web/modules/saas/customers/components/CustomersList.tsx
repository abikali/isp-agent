"use client";

import type { CustomerListStatus } from "@repo/api/modules/customers/lib/statuses";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { EmptyState } from "@shared/components/EmptyState";
import { PageShell } from "@shared/components/PageShell";
import { StatusIndicator } from "@shared/components/StatusIndicator";
import { SyncPreviewDialog } from "@shared/components/SyncPreviewDialog";
import { useServerSorting } from "@shared/hooks/use-server-sorting";
import { displayName } from "@shared/lib/display-name";
import { formatDate } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { useDebouncedValue } from "@tanstack/react-pacer";
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
import { Button } from "@ui/components/button";
import { DataTable } from "@ui/components/data-table";
import {
	DownloadIcon,
	MapPinIcon,
	PlusIcon,
	RefreshCwIcon,
	StickyNoteIcon,
	UploadIcon,
	UsersIcon,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
	useBulkRequestLocation,
	useCreateLocationRequest,
	useCustomers,
} from "../hooks/use-customers";
import {
	formatLocationRequestAge,
	isLocationRequestRecent,
} from "../lib/location-utils";
import { BulkExportButton } from "./BulkExportButton";
import { BulkImportDialog } from "./BulkImportDialog";
import { CreateCustomerDialog } from "./CreateCustomerDialog";
import { CustomerFilters } from "./CustomerFilters";
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

const PAGE_SIZE = 25;

const sortByMap = {
	name: "lastName",
	accountNumber: "accountNumber",
	username: "username",
	balance: "balance",
} as const satisfies Record<string, string>;

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
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 300 });
	const [status, setStatus] = useState("all");
	const [planId, setPlanId] = useState("all");
	const [stationId, setStationId] = useState("all");
	const [connectionType, setConnectionType] = useState("all");
	const [groupName, setGroupName] = useState("all");
	const [collectorId, setCollectorId] = useState("all");
	const [hasLocation, setHasLocation] = useState<"all" | "yes" | "no">("all");
	const [page, setPage] = useState(1);
	const { sorting, sortBy, sortOrder, onSortingChange } = useServerSorting(
		sortByMap,
		() => setPage(1),
	);
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

	const selectedIds = useMemo(
		() => Object.keys(rowSelection),
		[rowSelection],
	);
	const selectedCount = selectedIds.length;

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
		status: status !== "all" ? (status as CustomerListStatus) : undefined,
		planId: planId !== "all" ? planId : undefined,
		stationId: stationId !== "all" ? stationId : undefined,
		connectionType:
			connectionType !== "all"
				? (connectionType as
						| "FIBER"
						| "WIRELESS"
						| "DSL"
						| "CABLE"
						| "ETHERNET")
				: undefined,
		groupName: groupName !== "all" ? groupName : undefined,
		collectorId: collectorId !== "all" ? collectorId : undefined,
		hasLocation: hasLocation !== "all" ? hasLocation : undefined,
		page,
		sortBy,
		sortOrder,
	};

	const { customers, total, isLoading, isFetching } = useCustomers(filters);

	const columns = useMemo<ColumnDef<CustomerRow, unknown>[]>(
		() => [
			{
				id: "status",
				enableSorting: false,
				meta: { className: "w-10 pr-0" },
				cell: ({ row }) => (
					<StatusIndicator
						status={getConnectivityStatus(
							row.original.status,
							row.original.online,
						)}
						label=""
						size="sm"
					/>
				),
			},
			{
				id: "accountNumber",
				header: "Account",
				accessorFn: (row) => row.accountNumber,
				enableSorting: true,
				cell: ({ row }) => (
					<Link
						to="/app/$organizationSlug/customers/$customerId"
						params={{
							organizationSlug,
							customerId: row.original.id,
						}}
						className="font-mono text-xs text-primary hover:underline"
						preload="intent"
					>
						{row.original.accountNumber}
					</Link>
				),
			},
			{
				id: "name",
				header: "Name",
				accessorFn: (row) => row.lastName,
				enableSorting: true,
				cell: ({ row }) => {
					const note = row.original.notes?.trim();
					return (
						<div>
							<div className="flex items-center gap-1.5">
								<Link
									to="/app/$organizationSlug/customers/$customerId"
									params={{
										organizationSlug,
										customerId: row.original.id,
									}}
									className="font-medium hover:underline"
									preload="intent"
								>
									{displayName(
										row.original.firstName,
										row.original.lastName,
									)}
								</Link>
								{note && (
									<span
										title={note}
										className="inline-flex shrink-0"
									>
										<StickyNoteIcon className="size-3.5 text-amber-600 dark:text-amber-400" />
									</span>
								)}
							</div>
							{row.original.email && (
								<p className="text-xs text-muted-foreground">
									{row.original.email}
								</p>
							)}
						</div>
					);
				},
			},
			{
				id: "username",
				header: "Username",
				accessorFn: (row) => row.username,
				enableSorting: true,
				meta: { className: "hidden md:table-cell" },
				cell: ({ row }) =>
					row.original.username ? (
						<span className="font-mono text-xs">
							{row.original.username}
						</span>
					) : (
						<span className="text-muted-foreground">-</span>
					),
			},
			{
				id: "groupName",
				header: "Group",
				enableSorting: false,
				meta: { className: "hidden lg:table-cell" },
				cell: ({ row }) =>
					row.original.groupName ? (
						<span className="text-xs">
							{row.original.groupName}
						</span>
					) : (
						<span className="text-muted-foreground">-</span>
					),
			},
			{
				id: "plan",
				header: "Plan",
				enableSorting: false,
				meta: { className: "hidden md:table-cell" },
				cell: ({ row }) =>
					row.original.plan?.name ?? (
						<span className="text-muted-foreground">-</span>
					),
			},
			{
				id: "station",
				header: "Station",
				enableSorting: false,
				meta: { className: "hidden lg:table-cell" },
				cell: ({ row }) =>
					row.original.station?.name ?? (
						<span className="text-muted-foreground">-</span>
					),
			},
			{
				id: "collector",
				header: "Collector",
				enableSorting: false,
				meta: { className: "hidden lg:table-cell" },
				cell: ({ row }) =>
					row.original.collector?.name ?? (
						<span className="text-muted-foreground">-</span>
					),
			},
			{
				id: "expiry",
				header: "Expiry",
				accessorFn: (row) => row.expiresAt,
				enableSorting: false,
				meta: { className: "hidden lg:table-cell whitespace-nowrap" },
				cell: ({ row }) => {
					const value = row.original.expiresAt;
					if (!value) {
						return <span className="text-muted-foreground">-</span>;
					}
					const isExpired = new Date(value).getTime() < Date.now();
					return (
						<span
							className={
								isExpired
									? "font-medium text-red-600 dark:text-red-400"
									: undefined
							}
						>
							{formatDate(value)}
						</span>
					);
				},
			},
			{
				id: "balance",
				header: "Balance",
				accessorFn: (row) => row.balance,
				enableSorting: true,
				meta: { className: "hidden sm:table-cell text-right" },
				cell: ({ row }) => (
					<span className="font-mono tabular-nums">
						${row.original.balance.toFixed(2)}
					</span>
				),
			},
			{
				id: "actions",
				enableSorting: false,
				meta: { className: "w-20" },
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
					<Button
						variant="outline"
						onClick={() => setDialog("iradius-import")}
					>
						<DownloadIcon className="mr-2 size-4" />
						Import from iRadius
					</Button>
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
					activeStatus={status}
					onStatusChange={(v) => {
						setStatus(v);
						setPage(1);
					}}
				/>
			</AsyncBoundary>

			<CustomerFilters
				search={search}
				onSearchChange={(v) => {
					setSearch(v);
					setPage(1);
				}}
				status={status}
				onStatusChange={(v) => {
					setStatus(v);
					setPage(1);
				}}
				planId={planId}
				onPlanIdChange={(v) => {
					setPlanId(v);
					setPage(1);
				}}
				stationId={stationId}
				onStationIdChange={(v) => {
					setStationId(v);
					setPage(1);
				}}
				connectionType={connectionType}
				onConnectionTypeChange={(v) => {
					setConnectionType(v);
					setPage(1);
				}}
				groupName={groupName}
				onGroupNameChange={(v) => {
					setGroupName(v);
					setPage(1);
				}}
				collectorId={collectorId}
				onCollectorIdChange={(v) => {
					setCollectorId(v);
					setPage(1);
				}}
				hasLocation={hasLocation}
				onHasLocationChange={(v) => {
					setHasLocation(v);
					setPage(1);
				}}
			/>

			{selectedCount > 0 && (
				<div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/50 px-4 py-2">
					<span className="text-sm text-muted-foreground">
						{selectedCount} selected
					</span>
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
						Request location ({selectedCount})
					</Button>
				</div>
			)}

			<DataTable
				columns={columns}
				data={customers}
				sorting={sorting}
				onSortingChange={onSortingChange}
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
