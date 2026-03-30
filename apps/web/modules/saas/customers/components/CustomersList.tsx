"use client";

import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { EmptyState } from "@shared/components/EmptyState";
import { PageShell } from "@shared/components/PageShell";
import { StatusIndicator } from "@shared/components/StatusIndicator";
import { displayName } from "@shared/lib/display-name";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@ui/components/button";
import { DataTable } from "@ui/components/data-table";
import { PencilIcon, PlusIcon, UploadIcon, UsersIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useCustomers } from "../hooks/use-customers";
import { BulkExportButton } from "./BulkExportButton";
import { BulkImportDialog } from "./BulkImportDialog";
import { CreateCustomerDialog } from "./CreateCustomerDialog";
import { CustomerFilters } from "./CustomerFilters";
import { CustomerStats } from "./CustomerStats";
import { CustomerStatsSkeleton } from "./CustomerStatsSkeleton";

type CustomerStatus =
	| "ACTIVE"
	| "INACTIVE"
	| "SUSPENDED"
	| "PENDING"
	| "EXPIRED";

const statusMap: Record<
	string,
	"active" | "inactive" | "suspended" | "pending" | "expired"
> = {
	ACTIVE: "active",
	INACTIVE: "inactive",
	SUSPENDED: "suspended",
	PENDING: "pending",
	EXPIRED: "expired",
};

const PAGE_SIZE = 25;

interface CustomerRow {
	id: string;
	status: string;
	accountNumber: string;
	username: string | null;
	firstName: string | null;
	lastName: string | null;
	email: string | null;
	plan: { name: string } | null;
	station: { name: string } | null;
	connectionType: string | null;
	balance: number;
}

export function CustomersList({
	organizationSlug,
}: {
	organizationSlug: string;
}) {
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 300 });
	const [status, setStatus] = useState("all");
	const [planId, setPlanId] = useState("all");
	const [stationId, setStationId] = useState("all");
	const [connectionType, setConnectionType] = useState("all");
	const [page, setPage] = useState(1);
	const [showCreate, setShowCreate] = useState(false);
	const [showImport, setShowImport] = useState(false);

	const filters = {
		search: debouncedSearch || undefined,
		status: status !== "all" ? (status as CustomerStatus) : undefined,
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
		page,
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
						status={statusMap[row.original.status] ?? "inactive"}
						label=""
						size="sm"
					/>
				),
			},
			{
				id: "accountNumber",
				header: "Account",
				enableSorting: false,
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
				enableSorting: false,
				cell: ({ row }) => (
					<div>
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
						{row.original.email && (
							<p className="text-xs text-muted-foreground">
								{row.original.email}
							</p>
						)}
					</div>
				),
			},
			{
				id: "username",
				header: "Username",
				enableSorting: false,
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
				id: "connectionType",
				header: "Connection",
				enableSorting: false,
				meta: { className: "hidden lg:table-cell text-xs" },
				cell: ({ row }) =>
					row.original.connectionType ?? (
						<span className="text-muted-foreground">-</span>
					),
			},
			{
				id: "balance",
				header: "Balance",
				enableSorting: false,
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
				meta: { className: "w-10" },
				cell: ({ row }) => (
					<Button
						variant="ghost"
						size="icon"
						className="size-8"
						asChild
					>
						<Link
							to="/app/$organizationSlug/customers/$customerId"
							params={{
								organizationSlug,
								customerId: row.original.id,
							}}
							preload="intent"
						>
							<PencilIcon className="size-4" />
							<span className="sr-only">Edit</span>
						</Link>
					</Button>
				),
			},
		],
		[organizationSlug],
	);

	return (
		<PageShell
			title="Customers"
			actions={
				<>
					<BulkExportButton
						filters={{
							status: filters.status,
							planId: filters.planId,
							stationId: filters.stationId,
						}}
					/>
					<Button
						variant="outline"
						onClick={() => setShowImport(true)}
					>
						<UploadIcon className="mr-2 size-4" />
						Import
					</Button>
					<Button onClick={() => setShowCreate(true)}>
						<PlusIcon className="mr-2 size-4" />
						Add Customer
					</Button>
				</>
			}
		>
			<AsyncBoundary fallback={<CustomerStatsSkeleton />}>
				<CustomerStats />
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
			/>

			<DataTable
				columns={columns}
				data={customers}
				pagination={{
					totalItems: total,
					currentPage: page,
					itemsPerPage: PAGE_SIZE,
					onPageChange: setPage,
				}}
				isLoading={isLoading}
				isFetching={isFetching}
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
								<Button onClick={() => setShowCreate(true)}>
									<PlusIcon className="mr-2 size-4" />
									Add Customer
								</Button>
							) : undefined
						}
					/>
				}
			/>

			<CreateCustomerDialog
				open={showCreate}
				onOpenChange={setShowCreate}
			/>
			<BulkImportDialog open={showImport} onOpenChange={setShowImport} />
		</PageShell>
	);
}
