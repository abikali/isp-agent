"use client";

import { useEmployeesQuery } from "@saas/employees/client";
import { SearchInput } from "@shared/components/SearchInput";
import { formatCurrency, formatDate } from "@shared/lib/format";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@ui/components/button";
import { DataTable } from "@ui/components/data-table";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { BoxesIcon, ChevronRightIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useStockItemsQuery, useWorkerStockQuery } from "../hooks/use-stock";

type WorkerAllocation = ReturnType<
	typeof useWorkerStockQuery
>["allocations"][number];

interface WorkerSummary {
	id: string;
	name: string;
	itemCount: number;
	units: number;
	value: number;
}

function ModalEmpty({ text }: { text: string }) {
	return (
		<div className="flex flex-col items-center gap-2 py-10 text-center">
			<BoxesIcon className="size-8 text-muted-foreground/50" />
			<p className="text-sm text-muted-foreground">{text}</p>
		</div>
	);
}

export function WorkerAllocationsDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { employees } = useEmployeesQuery({ role: "worker" });
	const [employeeId, setEmployeeId] = useState<string>("all");
	const [search, setSearch] = useState("");

	// Overview across all workers is aggregated from the stock list (each item
	// already carries its worker allocations) — no extra endpoint needed.
	const { items, isLoading: itemsLoading } = useStockItemsQuery();
	const { allocations, totalValue, isLoading } = useWorkerStockQuery(
		employeeId === "all" ? null : employeeId,
	);

	const selectWorker = useCallback((id: string) => {
		setEmployeeId(id);
		setSearch("");
	}, []);

	const workerSummaries = useMemo(() => {
		const map = new Map<string, WorkerSummary>();
		for (const item of items) {
			for (const alloc of item.workerAllocations) {
				const { employee } = alloc;
				const entry = map.get(employee.id) ?? {
					id: employee.id,
					name: employee.name,
					itemCount: 0,
					units: 0,
					value: 0,
				};
				entry.itemCount += 1;
				entry.units += alloc.quantity;
				entry.value += alloc.quantity * alloc.unitPrice;
				map.set(employee.id, entry);
			}
		}
		return [...map.values()].sort((a, b) => b.value - a.value);
	}, [items]);

	const normalizedSearch = search.trim().toLowerCase();

	const filteredSummaries = useMemo(
		() =>
			normalizedSearch
				? workerSummaries.filter((w) =>
						w.name.toLowerCase().includes(normalizedSearch),
					)
				: workerSummaries,
		[workerSummaries, normalizedSearch],
	);

	const filteredAllocations = useMemo(
		() =>
			normalizedSearch
				? allocations.filter((a) =>
						a.stockItem.name
							.toLowerCase()
							.includes(normalizedSearch),
					)
				: allocations,
		[allocations, normalizedSearch],
	);

	const overviewColumns = useMemo<ColumnDef<WorkerSummary, unknown>[]>(
		() => [
			{
				accessorKey: "name",
				header: "Worker",
				cell: ({ row }) => (
					<button
						type="button"
						onClick={() => selectWorker(row.original.id)}
						className="text-sm font-medium hover:underline"
					>
						{row.original.name}
					</button>
				),
			},
			{
				accessorKey: "itemCount",
				header: "Items",
				cell: ({ row }) => (
					<span className="font-mono text-sm tabular-nums">
						{row.original.itemCount}
					</span>
				),
			},
			{
				accessorKey: "units",
				header: "Units",
				cell: ({ row }) => (
					<span className="font-mono text-sm tabular-nums">
						{row.original.units}
					</span>
				),
			},
			{
				accessorKey: "value",
				header: "Value",
				meta: { className: "text-right whitespace-nowrap" },
				cell: ({ row }) => (
					<span className="font-mono text-sm font-medium tabular-nums">
						{formatCurrency(row.original.value)}
					</span>
				),
			},
			{
				id: "open",
				enableSorting: false,
				meta: { className: "w-[1%]" },
				cell: ({ row }) => (
					<Button
						variant="ghost"
						size="icon"
						className="size-7"
						onClick={() => selectWorker(row.original.id)}
						aria-label={`View ${row.original.name}'s stock`}
					>
						<ChevronRightIcon className="size-4" />
					</Button>
				),
			},
		],
		[selectWorker],
	);

	const workerColumns = useMemo<ColumnDef<WorkerAllocation, unknown>[]>(
		() => [
			{
				id: "item",
				accessorFn: (row) => row.stockItem.name,
				header: "Item",
				cell: ({ row }) => (
					<span className="text-sm font-medium">
						{row.original.stockItem.name}
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
				accessorKey: "unitPrice",
				header: "Unit price",
				meta: { className: "hidden sm:table-cell whitespace-nowrap" },
				cell: ({ row }) => (
					<span className="font-mono text-sm tabular-nums">
						{formatCurrency(row.original.unitPrice)}
					</span>
				),
			},
			{
				id: "value",
				accessorFn: (row) => row.quantity * row.unitPrice,
				header: "Value",
				meta: { className: "text-right whitespace-nowrap" },
				cell: ({ row }) => (
					<span className="font-mono text-sm font-medium tabular-nums">
						{formatCurrency(
							row.original.quantity * row.original.unitPrice,
						)}
					</span>
				),
			},
			{
				accessorKey: "updatedAt",
				header: "Last movement",
				meta: { className: "hidden md:table-cell whitespace-nowrap" },
				cell: ({ row }) => (
					<span className="text-sm text-muted-foreground tabular-nums">
						{formatDate(row.original.updatedAt, {
							dateStyle: "medium",
						})}
					</span>
				),
			},
		],
		[],
	);

	const isAll = employeeId === "all";
	const overviewTotal = workerSummaries.reduce((sum, w) => sum + w.value, 0);
	const workerUnits = filteredAllocations.reduce(
		(sum, a) => sum + a.quantity,
		0,
	);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>Worker Stock</DialogTitle>
				</DialogHeader>
				<div className="space-y-3">
					<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
						<Select value={employeeId} onValueChange={selectWorker}>
							<SelectTrigger className="sm:w-56">
								<SelectValue placeholder="Select worker" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">
									All workers (overview)
								</SelectItem>
								{employees.map((emp) => (
									<SelectItem key={emp.id} value={emp.id}>
										{emp.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<SearchInput
							placeholder={
								isAll ? "Search workers…" : "Search items…"
							}
							value={search}
							onChange={setSearch}
							className="sm:max-w-none"
						/>
					</div>

					<div className="overflow-hidden rounded-lg border border-border">
						{isAll ? (
							<DataTable
								columns={overviewColumns}
								data={filteredSummaries}
								isLoading={itemsLoading}
								emptyState={
									<ModalEmpty
										text={
											normalizedSearch
												? "No workers match your search."
												: "No worker holds any stock right now."
										}
									/>
								}
							/>
						) : (
							<DataTable
								columns={workerColumns}
								data={filteredAllocations}
								isLoading={isLoading}
								emptyState={
									<ModalEmpty
										text={
											normalizedSearch
												? "No items match your search."
												: "This worker holds no stock."
										}
									/>
								}
							/>
						)}
					</div>

					<div className="flex items-center justify-between text-sm">
						<span className="text-muted-foreground">
							{isAll
								? `${filteredSummaries.length} worker${filteredSummaries.length === 1 ? "" : "s"} holding stock`
								: `${filteredAllocations.length} item${filteredAllocations.length === 1 ? "" : "s"} · ${workerUnits} unit${workerUnits === 1 ? "" : "s"}`}
						</span>
						<span className="font-mono font-medium tabular-nums">
							{isAll
								? formatCurrency(overviewTotal)
								: formatCurrency(totalValue)}
						</span>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
