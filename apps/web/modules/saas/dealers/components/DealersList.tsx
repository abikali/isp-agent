"use client";

import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { EmptyState } from "@shared/components/EmptyState";
import { PageShell } from "@shared/components/PageShell";
import { StatusIndicator } from "@shared/components/StatusIndicator";
import { formatCurrency } from "@shared/lib/format";
import { orpc } from "@shared/lib/orpc";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Alert, AlertDescription } from "@ui/components/alert";
import { Button } from "@ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/card";
import { DataTable } from "@ui/components/data-table";
import {
	CheckCircle2Icon,
	DatabaseIcon,
	HandshakeIcon,
	LoaderIcon,
	PlusIcon,
	RefreshCwIcon,
	XCircleIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	useDealerSyncStatus,
	useDealers,
	useSyncDealers,
} from "../hooks/use-dealers";
import { CreateDealerDialog } from "./CreateDealerDialog";
import { DealerFilters } from "./DealerFilters";
import { DealerStats } from "./DealerStats";
import { DealerStatsSkeleton } from "./DealerStatsSkeleton";

const statusMap: Record<
	string,
	"active" | "inactive" | "suspended" | "pending"
> = {
	ACTIVE: "active",
	INACTIVE: "inactive",
	SUSPENDED: "suspended",
	PENDING: "pending",
};

interface DealerRow {
	id: string;
	status: string;
	name: string;
	username: string | null;
	companyName: string | null;
	phone: string | null;
	parentDealer: { id: string; name: string } | null;
	_count: { customers: number; employees: number };
	credit: number | null;
}

function DealerSyncPanel() {
	const [operationId, setOperationId] = useState<string | null>(null);
	const syncDealers = useSyncDealers();
	const invalidatedRef = useRef<string | null>(null);
	const queryClient = useQueryClient();

	const { data: statusData } = useDealerSyncStatus(operationId);
	const operation = statusData?.operation;

	const isActive =
		operation?.status === "pending" || operation?.status === "in_progress";
	const isComplete = operation?.status === "completed";
	const isFailed = operation?.status === "failed";

	// Invalidate dealer list once when sync completes
	useEffect(() => {
		if (
			(isComplete || isFailed) &&
			operation?.id &&
			invalidatedRef.current !== operation.id
		) {
			invalidatedRef.current = operation.id;
			queryClient.invalidateQueries({
				queryKey: orpc.admin.dealers.key(),
			});
		}
	}, [isComplete, isFailed, operation?.id, queryClient]);

	async function handleSync() {
		try {
			const result = await syncDealers.mutateAsync({});
			setOperationId(result.operationId);
		} catch {
			// Error handled by mutation
		}
	}

	return (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle className="flex items-center gap-2 text-base">
					<DatabaseIcon className="size-4" />
					Sync Dealers from iRadius
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-3">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<p className="text-sm text-muted-foreground">
						Import or update all dealers from iRadius. Dealers can
						then be assigned to organizations.
					</p>
					<Button
						onClick={handleSync}
						disabled={isActive || syncDealers.isPending}
						className="shrink-0 w-full sm:w-auto"
					>
						{isActive ? (
							<>
								<LoaderIcon className="mr-2 size-4 animate-spin" />
								Syncing...
							</>
						) : (
							<>
								<RefreshCwIcon className="mr-2 size-4" />
								Sync Dealers
							</>
						)}
					</Button>
				</div>

				{isActive && operation && (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<LoaderIcon className="size-3.5 animate-spin" />
						<span>
							Phase: {operation.phase ?? "starting"}
							{typeof operation.processedDealers === "number" &&
								typeof operation.totalDealers === "number" &&
								operation.totalDealers > 0 && (
									<span className="ml-1 tabular-nums">
										({operation.processedDealers}/
										{operation.totalDealers})
									</span>
								)}
						</span>
					</div>
				)}

				{isComplete && (
					<Alert>
						<CheckCircle2Icon className="size-4" />
						<AlertDescription>
							Dealer sync completed successfully.
						</AlertDescription>
					</Alert>
				)}

				{isFailed && (
					<Alert variant="error">
						<XCircleIcon className="size-4" />
						<AlertDescription>
							Dealer sync failed. Check server logs for details.
						</AlertDescription>
					</Alert>
				)}
			</CardContent>
		</Card>
	);
}

export function DealersList() {
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 300 });
	const [status, setStatus] = useState("all");
	const [page, setPage] = useState(1);
	const [showCreate, setShowCreate] = useState(false);

	const filters = {
		search: debouncedSearch || undefined,
		status:
			status !== "all"
				? (status as "ACTIVE" | "INACTIVE" | "SUSPENDED" | "PENDING")
				: undefined,
		page,
	};

	const { dealers, total, pageSize, isLoading, isFetching } =
		useDealers(filters);

	const columns = useMemo<ColumnDef<DealerRow, unknown>[]>(
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
				id: "name",
				header: "Name",
				enableSorting: false,
				cell: ({ row }) => (
					<div>
						<Link
							to="/app/admin/dealers/$dealerId"
							params={{
								dealerId: row.original.id,
							}}
							className="font-medium hover:underline"
							preload="intent"
						>
							{row.original.name}
						</Link>
						{row.original.username && (
							<p className="text-xs text-muted-foreground">
								{row.original.username}
							</p>
						)}
					</div>
				),
			},
			{
				id: "company",
				header: "Company",
				enableSorting: false,
				meta: { className: "hidden md:table-cell" },
				cell: ({ row }) =>
					row.original.companyName ?? (
						<span className="text-muted-foreground">-</span>
					),
			},
			{
				id: "phone",
				header: "Phone",
				enableSorting: false,
				meta: { className: "hidden md:table-cell" },
				cell: ({ row }) =>
					row.original.phone ?? (
						<span className="text-muted-foreground">-</span>
					),
			},
			{
				id: "parentDealer",
				header: "Parent Dealer",
				enableSorting: false,
				meta: { className: "hidden lg:table-cell" },
				cell: ({ row }) =>
					row.original.parentDealer ? (
						<Link
							to="/app/admin/dealers/$dealerId"
							params={{
								dealerId: row.original.parentDealer.id,
							}}
							className="text-sm hover:underline"
							preload="intent"
						>
							{row.original.parentDealer.name}
						</Link>
					) : (
						<span className="text-muted-foreground">-</span>
					),
			},
			{
				id: "customers",
				header: "Customers",
				enableSorting: false,
				meta: { className: "hidden lg:table-cell tabular-nums" },
				cell: ({ row }) => row.original._count.customers,
			},
			{
				id: "employees",
				header: "Employees",
				enableSorting: false,
				meta: { className: "hidden lg:table-cell tabular-nums" },
				cell: ({ row }) => row.original._count.employees,
			},
			{
				id: "credit",
				header: "Credit",
				enableSorting: false,
				meta: {
					className:
						"hidden lg:table-cell text-right font-mono tabular-nums",
				},
				cell: ({ row }) =>
					typeof row.original.credit === "number"
						? formatCurrency(row.original.credit)
						: "-",
			},
		],
		[],
	);

	return (
		<PageShell
			title="Dealers"
			actions={
				<Button onClick={() => setShowCreate(true)}>
					<PlusIcon className="mr-2 size-4" />
					Add Dealer
				</Button>
			}
		>
			<AsyncBoundary fallback={<DealerStatsSkeleton />}>
				<DealerStats />
			</AsyncBoundary>

			<DealerSyncPanel />

			<DealerFilters
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
			/>

			<DataTable
				columns={columns}
				data={dealers}
				pagination={{
					totalItems: total,
					currentPage: page,
					itemsPerPage: pageSize,
					onPageChange: setPage,
				}}
				isLoading={isLoading}
				isFetching={isFetching}
				emptyState={
					<EmptyState
						icon={HandshakeIcon}
						title={
							total === 0 ? "No dealers yet" : "No results found"
						}
						description={
							total === 0
								? "Add your first dealer to get started."
								: "Try adjusting your filters or search term."
						}
						action={
							total === 0 ? (
								<Button onClick={() => setShowCreate(true)}>
									<PlusIcon className="mr-2 size-4" />
									Add Dealer
								</Button>
							) : undefined
						}
					/>
				}
			/>

			<CreateDealerDialog
				open={showCreate}
				onOpenChange={setShowCreate}
			/>
		</PageShell>
	);
}
