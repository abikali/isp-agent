"use client";

import { useEmployeesQuery } from "@saas/employees/client";
import { Pagination } from "@saas/shared/components/Pagination";
import {
	ContentCard,
	ContentCardToolbar,
} from "@shared/components/ContentCard";
import { EmptyState } from "@shared/components/EmptyState";
import { PageShell } from "@shared/components/PageShell";
import { formatDateTime } from "@shared/lib/format";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@ui/components/badge";
import { DataTable } from "@ui/components/data-table";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { HistoryIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useStockItemsQuery, useStockLogs } from "../hooks/use-stock";

type StockLogRow = ReturnType<typeof useStockLogs>["logs"][number];

const ACTION_LABELS: Record<
	string,
	{ label: string; variant: "info" | "success" | "warning" | "error" }
> = {
	ADD: { label: "Added", variant: "success" },
	REMOVE: { label: "Removed", variant: "warning" },
	TRANSFER_TO_WORKER: { label: "To worker", variant: "info" },
	TRANSFER_FROM_WORKER: { label: "From worker", variant: "info" },
	ADJUST: { label: "Adjusted", variant: "warning" },
	DELIVER: { label: "Delivered", variant: "info" },
};

type StockAction =
	| "ADD"
	| "REMOVE"
	| "TRANSFER_TO_WORKER"
	| "TRANSFER_FROM_WORKER"
	| "ADJUST"
	| "DELIVER";

export function StockLogList() {
	const [page, setPage] = useState(1);
	const [stockItemId, setStockItemId] = useState<string | undefined>();
	const [employeeId, setEmployeeId] = useState<string | undefined>();
	const [action, setAction] = useState<StockAction | undefined>();

	const { items } = useStockItemsQuery();
	const { employees } = useEmployeesQuery();
	const { logs, total, totalPages } = useStockLogs({
		stockItemId,
		employeeId,
		action,
		page,
	});

	const columns = useMemo<ColumnDef<StockLogRow, unknown>[]>(
		() => [
			{
				accessorKey: "createdAt",
				header: "Date",
				cell: ({ row }) => (
					<span className="whitespace-nowrap text-sm tabular-nums">
						{formatDateTime(row.original.createdAt, {
							dateStyle: "medium",
							timeStyle: "short",
						})}
					</span>
				),
			},
			{
				accessorKey: "action",
				header: "Action",
				cell: ({ row }) => {
					const cfg = ACTION_LABELS[row.original.action] ?? {
						label: row.original.action,
						variant: "info" as const,
					};
					return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
				},
			},
			{
				accessorKey: "itemName",
				header: "Item",
				cell: ({ row }) => (
					<span className="text-sm font-medium">
						{row.original.itemName}
					</span>
				),
			},
			{
				accessorKey: "quantity",
				header: "Qty",
				cell: ({ row }) => (
					<span className="font-mono text-sm tabular-nums">
						{row.original.quantity}
					</span>
				),
			},
			{
				id: "worker",
				header: "Worker",
				cell: ({ row }) => (
					<span className="text-sm">
						{row.original.employee?.name ?? (
							<span className="text-muted-foreground">
								&mdash;
							</span>
						)}
					</span>
				),
			},
			{
				id: "adminChange",
				header: "Admin Stock",
				meta: { className: "hidden md:table-cell" },
				cell: ({ row }) => {
					const { adminQtyBefore, adminQtyAfter } = row.original;
					if (adminQtyBefore === null || adminQtyAfter === null) {
						return (
							<span className="text-muted-foreground">
								&mdash;
							</span>
						);
					}
					return (
						<span className="font-mono text-sm tabular-nums">
							{adminQtyBefore} → {adminQtyAfter}
						</span>
					);
				},
			},
			{
				id: "workerChange",
				header: "Worker Stock",
				meta: { className: "hidden md:table-cell" },
				cell: ({ row }) => {
					const { workerQtyBefore, workerQtyAfter } = row.original;
					if (workerQtyBefore === null || workerQtyAfter === null) {
						return (
							<span className="text-muted-foreground">
								&mdash;
							</span>
						);
					}
					return (
						<span className="font-mono text-sm tabular-nums">
							{workerQtyBefore} → {workerQtyAfter}
						</span>
					);
				},
			},
			{
				id: "performedBy",
				header: "By",
				meta: { className: "hidden lg:table-cell" },
				cell: ({ row }) => (
					<span className="text-sm text-muted-foreground">
						{row.original.performedBy?.name ?? "—"}
					</span>
				),
			},
			{
				accessorKey: "notes",
				header: "Notes",
				enableSorting: false,
				meta: { className: "hidden lg:table-cell" },
				cell: ({ row }) => (
					<span className="line-clamp-1 max-w-48 text-xs text-muted-foreground">
						{row.original.notes ?? ""}
					</span>
				),
			},
		],
		[],
	);

	return (
		<PageShell
			title="Stock Log"
			description="Complete audit trail of every stock movement — additions, deliveries, returns, and adjustments."
		>
			<ContentCard>
				<ContentCardToolbar>
					<div className="flex flex-wrap items-center gap-2">
						<Select
							value={stockItemId ?? "all"}
							onValueChange={(v) => {
								setStockItemId(v === "all" ? undefined : v);
								setPage(1);
							}}
						>
							<SelectTrigger className="w-44">
								<SelectValue placeholder="All items" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All items</SelectItem>
								{items.map((item) => (
									<SelectItem key={item.id} value={item.id}>
										{item.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Select
							value={employeeId ?? "all"}
							onValueChange={(v) => {
								setEmployeeId(v === "all" ? undefined : v);
								setPage(1);
							}}
						>
							<SelectTrigger className="w-44">
								<SelectValue placeholder="All workers" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All workers</SelectItem>
								{employees.map((emp) => (
									<SelectItem key={emp.id} value={emp.id}>
										{emp.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Select
							value={action ?? "all"}
							onValueChange={(v) => {
								setAction(
									v === "all"
										? undefined
										: (v as StockAction),
								);
								setPage(1);
							}}
						>
							<SelectTrigger className="w-44">
								<SelectValue placeholder="All actions" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All actions</SelectItem>
								{Object.entries(ACTION_LABELS).map(
									([value, cfg]) => (
										<SelectItem key={value} value={value}>
											{cfg.label}
										</SelectItem>
									),
								)}
							</SelectContent>
						</Select>
					</div>
				</ContentCardToolbar>

				<DataTable
					columns={columns}
					data={logs}
					pageSize={50}
					emptyState={
						<EmptyState
							icon={HistoryIcon}
							title="No stock movements"
							description="Stock activity will appear here once you add or deliver items."
						/>
					}
				/>

				{totalPages > 1 && (
					<div className="border-t px-4 py-3">
						<Pagination
							currentPage={page}
							totalItems={total}
							itemsPerPage={50}
							onChangeCurrentPage={setPage}
						/>
					</div>
				)}
			</ContentCard>
		</PageShell>
	);
}
