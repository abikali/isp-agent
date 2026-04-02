"use client";

import type { RowData } from "@tanstack/react-table";

// Module augmentation: adds `className` to column meta for responsive hiding
declare module "@tanstack/react-table" {
	// biome-ignore lint/correctness/noUnusedVariables: required for module augmentation
	interface ColumnMeta<TData extends RowData, TValue> {
		/** Applied to both TableHead and TableCell (e.g. "hidden md:table-cell") */
		className?: string;
	}
}

import type {
	ColumnDef,
	OnChangeFn,
	Row,
	RowSelectionState,
	SortingState,
	VisibilityState,
} from "@tanstack/react-table";
import {
	flexRender,
	getCoreRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { cn } from "@ui/lib";
import {
	ArrowDownIcon,
	ArrowUpDownIcon,
	ArrowUpIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	SlidersHorizontalIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "./button";
import { Checkbox } from "./checkbox";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "./dropdown-menu";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "./table";

interface DataTablePagination {
	totalItems: number;
	currentPage: number;
	itemsPerPage: number;
	onPageChange: (page: number) => void;
}

interface DataTableProps<TData> {
	columns: ColumnDef<TData, unknown>[];
	data: TData[];

	/** Client-side page size. Enables client-side pagination + sorting. */
	pageSize?: number;

	/** Server-side pagination control. Disables client-side sorting. */
	pagination?: DataTablePagination;

	/** Controlled sorting state for server-side sorting. */
	sorting?: SortingState;

	/** Callback when sorting changes (enables server-side sorting with manual pagination). */
	onSortingChange?: (sorting: SortingState) => void;

	/** Show loading placeholder in table body */
	isLoading?: boolean;

	/** Dim table while refetching */
	isFetching?: boolean;

	/** Content shown when data is empty and not loading */
	emptyState?: ReactNode;

	/** Per-row className (e.g. for color-coding flagged rows) */
	getRowClassName?: (row: Row<TData>) => string | undefined;

	/** Additional className for the outer container */
	className?: string;

	/**
	 * Unique key for persisting column visibility to localStorage.
	 * When set, a column toggle dropdown is rendered and visibility
	 * is saved/restored automatically.
	 */
	columnVisibilityKey?: string;

	/** Enable row selection with checkboxes. Pass a function to control per-row selectability. */
	enableRowSelection?: boolean | ((row: Row<TData>) => boolean);

	/** Controlled row selection state (row ID → selected) */
	rowSelection?: RowSelectionState;

	/** Callback when row selection changes */
	onRowSelectionChange?: OnChangeFn<RowSelectionState>;

	/** Custom row ID accessor (defaults to row index) */
	getRowId?: (original: TData, index: number) => string;
}

function PaginationBar({
	totalItems,
	currentPage,
	itemsPerPage,
	onPageChange,
}: DataTablePagination) {
	const pageCount = Math.ceil(totalItems / itemsPerPage);
	if (pageCount <= 1) {
		return null;
	}

	const start = (currentPage - 1) * itemsPerPage + 1;
	const end = Math.min(currentPage * itemsPerPage, totalItems);

	return (
		<div className="flex items-center justify-between px-1 pt-4">
			<p className="text-sm text-muted-foreground">
				{start}–{end} of {totalItems}
			</p>
			<div className="flex items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					onClick={() => onPageChange(currentPage - 1)}
					disabled={currentPage <= 1}
				>
					<ChevronLeftIcon className="size-4" />
				</Button>
				<span className="text-sm tabular-nums text-muted-foreground">
					{currentPage} / {pageCount}
				</span>
				<Button
					variant="outline"
					size="sm"
					onClick={() => onPageChange(currentPage + 1)}
					disabled={currentPage >= pageCount}
				>
					<ChevronRightIcon className="size-4" />
				</Button>
			</div>
		</div>
	);
}

export function DataTable<TData>({
	columns,
	data,
	pageSize,
	pagination,
	sorting: controlledSorting,
	onSortingChange,
	isLoading,
	isFetching,
	emptyState,
	getRowClassName,
	className,
	columnVisibilityKey,
	enableRowSelection,
	rowSelection,
	onRowSelectionChange,
	getRowId,
}: DataTableProps<TData>) {
	const [internalSorting, setInternalSorting] = useState<SortingState>([]);

	const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
		() => {
			if (!columnVisibilityKey) {
				return {};
			}
			try {
				const stored = localStorage.getItem(
					`dt-cols:${columnVisibilityKey}`,
				);
				return stored ? JSON.parse(stored) : {};
			} catch {
				return {};
			}
		},
	);

	const handleVisibilityChange = useCallback(
		(
			updater:
				| VisibilityState
				| ((old: VisibilityState) => VisibilityState),
		) => {
			setColumnVisibility((prev) => {
				const next =
					typeof updater === "function" ? updater(prev) : updater;
				if (columnVisibilityKey) {
					localStorage.setItem(
						`dt-cols:${columnVisibilityKey}`,
						JSON.stringify(next),
					);
				}
				return next;
			});
		},
		[columnVisibilityKey],
	);

	const hasSelection = !!enableRowSelection;

	// Prepend a checkbox column when row selection is enabled
	const allColumns = useMemo(() => {
		if (!hasSelection) {
			return columns;
		}
		const selectCol: ColumnDef<TData, unknown> = {
			id: "select",
			header: ({ table: t }) => (
				<Checkbox
					checked={
						t.getIsAllPageRowsSelected() ||
						(t.getIsSomePageRowsSelected() && "indeterminate")
					}
					onCheckedChange={(v) => t.toggleAllPageRowsSelected(!!v)}
					aria-label="Select all"
				/>
			),
			cell: ({ row }) => (
				<Checkbox
					checked={row.getIsSelected()}
					disabled={!row.getCanSelect()}
					onCheckedChange={(v) => row.toggleSelected(!!v)}
					aria-label="Select row"
				/>
			),
			enableSorting: false,
			meta: { className: "w-10 pr-0" },
		};
		return [selectCol, ...columns];
	}, [columns, hasSelection]);

	const isManual = !!pagination;
	const isServerSorted = !!onSortingChange;
	const enableSorting = !isManual || isServerSorted;
	const enableClientPagination = !!pageSize && !isManual;

	const sorting = controlledSorting ?? internalSorting;
	const handleSortingChange = isServerSorted
		? (updater: SortingState | ((old: SortingState) => SortingState)) => {
				const next =
					typeof updater === "function" ? updater(sorting) : updater;
				onSortingChange(next);
			}
		: enableSorting
			? setInternalSorting
			: undefined;

	const table = useReactTable({
		data,
		columns: allColumns,
		enableSorting,
		manualSorting: isServerSorted,
		...(hasSelection
			? {
					enableRowSelection,
					onRowSelectionChange,
					state: {
						sorting,
						rowSelection: rowSelection ?? {},
						...(columnVisibilityKey ? { columnVisibility } : {}),
					},
				}
			: {
					state: {
						sorting,
						...(columnVisibilityKey ? { columnVisibility } : {}),
					},
				}),
		...(getRowId ? { getRowId } : {}),
		...(columnVisibilityKey
			? { onColumnVisibilityChange: handleVisibilityChange }
			: {}),
		...(handleSortingChange
			? { onSortingChange: handleSortingChange }
			: {}),
		getCoreRowModel: getCoreRowModel(),
		...(enableSorting && !isServerSorted
			? { getSortedRowModel: getSortedRowModel() }
			: {}),
		...(enableClientPagination
			? {
					getPaginationRowModel: getPaginationRowModel(),
					initialState: { pagination: { pageSize } },
				}
			: {}),
		...(isManual ? { manualPagination: true } : {}),
	});

	const rows = table.getRowModel().rows;
	const isEmpty = data.length === 0 && !isLoading;

	if (isEmpty && emptyState) {
		return <>{emptyState}</>;
	}

	const toggleableColumns = columnVisibilityKey
		? table
				.getAllColumns()
				.filter(
					(col) =>
						col.getCanHide() &&
						typeof col.columnDef.header === "string",
				)
		: [];

	return (
		<div>
			{toggleableColumns.length > 0 && (
				<div className="flex justify-end pb-2">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="outline" size="sm">
								<SlidersHorizontalIcon className="mr-1.5 size-3.5" />
								Columns
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-40">
							<DropdownMenuLabel>
								Toggle columns
							</DropdownMenuLabel>
							<DropdownMenuSeparator />
							{toggleableColumns.map((col) => (
								<DropdownMenuCheckboxItem
									key={col.id}
									checked={col.getIsVisible()}
									onCheckedChange={(v) =>
										col.toggleVisibility(!!v)
									}
								>
									{col.columnDef.header as string}
								</DropdownMenuCheckboxItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			)}
			<div
				className={cn(
					"rounded-xl border bg-card overflow-hidden transition-opacity",
					isFetching && "opacity-60",
					className,
				)}
			>
				<Table>
					<TableHeader>
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow key={headerGroup.id}>
								{headerGroup.headers.map((header) => {
									const meta = header.column.columnDef.meta;
									const canSort = header.column.getCanSort();
									const sorted = header.column.getIsSorted();

									return (
										<TableHead
											key={header.id}
											className={cn(meta?.className)}
										>
											{header.isPlaceholder ? null : canSort ? (
												<button
													type="button"
													className="inline-flex items-center gap-1 font-medium"
													onClick={header.column.getToggleSortingHandler()}
												>
													{flexRender(
														header.column.columnDef
															.header,
														header.getContext(),
													)}
													{sorted === "asc" ? (
														<ArrowUpIcon className="size-3" />
													) : sorted === "desc" ? (
														<ArrowDownIcon className="size-3" />
													) : (
														<ArrowUpDownIcon className="size-3 opacity-30" />
													)}
												</button>
											) : (
												flexRender(
													header.column.columnDef
														.header,
													header.getContext(),
												)
											)}
										</TableHead>
									);
								})}
							</TableRow>
						))}
					</TableHeader>
					<TableBody>
						{isLoading ? (
							<TableRow>
								<TableCell
									colSpan={allColumns.length}
									className="h-24 text-center text-muted-foreground"
								>
									Loading...
								</TableCell>
							</TableRow>
						) : rows.length > 0 ? (
							rows.map((row) => (
								<TableRow
									key={row.id}
									className={cn(
										"hover:bg-muted/30 transition-colors",
										getRowClassName?.(row),
									)}
								>
									{row.getVisibleCells().map((cell) => (
										<TableCell
											key={cell.id}
											className={cn(
												cell.column.columnDef.meta
													?.className,
											)}
										>
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext(),
											)}
										</TableCell>
									))}
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell
									colSpan={allColumns.length}
									className="h-24 text-center text-muted-foreground"
								>
									No results.
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>

			{isManual && pagination && <PaginationBar {...pagination} />}

			{enableClientPagination && table.getPageCount() > 1 && (
				<PaginationBar
					totalItems={data.length}
					currentPage={table.getState().pagination.pageIndex + 1}
					itemsPerPage={pageSize}
					onPageChange={(p) => table.setPageIndex(p - 1)}
				/>
			)}
		</div>
	);
}
