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
	ExpandedState,
	OnChangeFn,
	Row,
	RowSelectionState,
	SortingState,
	VisibilityState,
} from "@tanstack/react-table";
import {
	flexRender,
	getCoreRowModel,
	getExpandedRowModel,
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
	ChevronsLeftIcon,
	ChevronsRightIcon,
	SlidersHorizontalIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Fragment, useCallback, useMemo, useState } from "react";
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
import { Skeleton } from "./skeleton";
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
	 * Legacy: unique key for persisting column visibility to localStorage.
	 * When set (and `columnVisibility` is NOT also passed), a column toggle
	 * dropdown is rendered and visibility is saved/restored automatically.
	 */
	columnVisibilityKey?: string;

	/**
	 * Controlled column visibility state. Pair with onColumnVisibilityChange
	 * to fully control visibility from the consumer (e.g. when rendering the
	 * column toggle inside an external toolbar). When provided, the internal
	 * Columns dropdown is suppressed.
	 */
	columnVisibility?: VisibilityState;

	/** Setter for controlled column visibility. */
	onColumnVisibilityChange?: (next: VisibilityState) => void;

	/** Enable row selection with checkboxes. Pass a function to control per-row selectability. */
	enableRowSelection?: boolean | ((row: Row<TData>) => boolean);

	/** Controlled row selection state (row ID → selected) */
	rowSelection?: RowSelectionState;

	/** Callback when row selection changes */
	onRowSelectionChange?: OnChangeFn<RowSelectionState>;

	/** Custom row ID accessor (defaults to row index) */
	getRowId?: (original: TData, index: number) => string;

	/**
	 * Render an inline expandable detail panel under a row. When provided, an
	 * expand/collapse chevron column is prepended and clicking it reveals the
	 * returned content in a full-width sub-row. Purely additive.
	 */
	renderSubRow?: (row: Row<TData>) => ReactNode;

	/** Gate which rows can expand (defaults to all rows when renderSubRow is set). */
	getRowCanExpand?: (row: Row<TData>) => boolean;
}

function PaginationBar({
	totalItems,
	currentPage,
	itemsPerPage,
	onPageChange,
}: DataTablePagination) {
	const pageCount = Math.max(1, Math.ceil(totalItems / itemsPerPage));
	if (pageCount <= 1) {
		return null;
	}

	const start = (currentPage - 1) * itemsPerPage + 1;
	const end = Math.min(currentPage * itemsPerPage, totalItems);

	return (
		<div className="flex flex-col items-center justify-between gap-2 border-t border-border bg-surface-subtle/40 px-3 py-2 sm:flex-row md:px-4">
			<p className="text-xs text-muted-foreground">
				Showing{" "}
				<span className="font-medium text-foreground tabular-nums">
					{start.toLocaleString()}–{end.toLocaleString()}
				</span>{" "}
				of{" "}
				<span className="font-medium text-foreground tabular-nums">
					{totalItems.toLocaleString()}
				</span>
			</p>
			<div className="flex items-center gap-1">
				<Button
					variant="ghost"
					size="icon"
					onClick={() => onPageChange(1)}
					disabled={currentPage <= 1}
					aria-label="First page"
					className="size-7"
				>
					<ChevronsLeftIcon className="size-3.5" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					onClick={() => onPageChange(currentPage - 1)}
					disabled={currentPage <= 1}
					aria-label="Previous page"
					className="size-7"
				>
					<ChevronLeftIcon className="size-3.5" />
				</Button>
				<span className="px-2 text-xs tabular-nums text-muted-foreground">
					Page{" "}
					<span className="font-medium text-foreground">
						{currentPage}
					</span>{" "}
					of{" "}
					<span className="font-medium text-foreground">
						{pageCount}
					</span>
				</span>
				<Button
					variant="ghost"
					size="icon"
					onClick={() => onPageChange(currentPage + 1)}
					disabled={currentPage >= pageCount}
					aria-label="Next page"
					className="size-7"
				>
					<ChevronRightIcon className="size-3.5" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					onClick={() => onPageChange(pageCount)}
					disabled={currentPage >= pageCount}
					aria-label="Last page"
					className="size-7"
				>
					<ChevronsRightIcon className="size-3.5" />
				</Button>
			</div>
		</div>
	);
}

function SkeletonRows({
	columnCount,
	rowCount = 8,
}: {
	columnCount: number;
	rowCount?: number;
}) {
	return (
		<>
			{Array.from({ length: rowCount }).map((_, rowIdx) => (
				<TableRow key={`sk-${rowIdx}`} className="hover:bg-transparent">
					{Array.from({ length: columnCount }).map((__, colIdx) => (
						<TableCell key={`sk-${rowIdx}-${colIdx}`}>
							<Skeleton className="h-4 w-full max-w-[180px]" />
						</TableCell>
					))}
				</TableRow>
			))}
		</>
	);
}

// react-doctor-disable-next-line react-doctor/no-giant-component -- cohesive generic table primitive; the table state/config and render are a single unit (PaginationBar/SkeletonRows already extracted), further splitting would obscure data flow
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
	columnVisibility: controlledVisibility,
	onColumnVisibilityChange,
	enableRowSelection,
	rowSelection,
	onRowSelectionChange,
	getRowId,
	renderSubRow,
	getRowCanExpand,
}: DataTableProps<TData>) {
	const [internalSorting, setInternalSorting] = useState<SortingState>([]);
	const [expanded, setExpanded] = useState<ExpandedState>({});

	const isVisibilityControlled = controlledVisibility !== undefined;

	const [internalVisibility, setInternalVisibility] =
		useState<VisibilityState>(() => {
			if (!columnVisibilityKey || isVisibilityControlled) {
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
		});

	const columnVisibility = isVisibilityControlled
		? controlledVisibility
		: internalVisibility;

	const handleVisibilityChange = useCallback(
		(
			updater:
				| VisibilityState
				| ((old: VisibilityState) => VisibilityState),
		) => {
			if (isVisibilityControlled) {
				const next =
					typeof updater === "function"
						? updater(controlledVisibility ?? {})
						: updater;
				onColumnVisibilityChange?.(next);
				return;
			}
			setInternalVisibility((prev) => {
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
		[
			columnVisibilityKey,
			isVisibilityControlled,
			controlledVisibility,
			onColumnVisibilityChange,
		],
	);

	const visibilityActive = isVisibilityControlled || !!columnVisibilityKey;

	const hasSelection = !!enableRowSelection;
	const hasExpansion = !!renderSubRow;

	// Prepend checkbox (selection) and chevron (expansion) columns when enabled.
	const allColumns = useMemo(() => {
		const extra: ColumnDef<TData, unknown>[] = [];
		if (hasSelection) {
			extra.push({
				id: "select",
				header: ({ table: t }) => (
					<Checkbox
						checked={
							t.getIsAllPageRowsSelected() ||
							(t.getIsSomePageRowsSelected() && "indeterminate")
						}
						onCheckedChange={(v) =>
							t.toggleAllPageRowsSelected(!!v)
						}
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
			});
		}
		if (hasExpansion) {
			extra.push({
				id: "expand",
				header: () => null,
				cell: ({ row }) =>
					row.getCanExpand() ? (
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								row.toggleExpanded();
							}}
							className="inline-flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
							aria-label={
								row.getIsExpanded()
									? "Collapse row"
									: "Expand row"
							}
							aria-expanded={row.getIsExpanded()}
						>
							<ChevronRightIcon
								className={cn(
									"size-4 transition-transform",
									row.getIsExpanded() && "rotate-90",
								)}
							/>
						</button>
					) : null,
				enableSorting: false,
				meta: { className: "w-8 pr-0" },
			});
		}
		if (extra.length === 0) {
			return columns;
		}
		return [...extra, ...columns];
	}, [columns, hasSelection, hasExpansion]);

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
						...(hasExpansion ? { expanded } : {}),
						...(visibilityActive ? { columnVisibility } : {}),
					},
				}
			: {
					state: {
						sorting,
						...(hasExpansion ? { expanded } : {}),
						...(visibilityActive ? { columnVisibility } : {}),
					},
				}),
		...(hasExpansion
			? {
					onExpandedChange: setExpanded,
					getExpandedRowModel: getExpandedRowModel(),
					getRowCanExpand: getRowCanExpand ?? (() => true),
				}
			: {}),
		...(getRowId ? { getRowId } : {}),
		...(visibilityActive
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

	// Only render the built-in Columns dropdown for legacy/uncontrolled usage.
	// When the consumer controls visibility, they render their own toggle
	// inside their toolbar (see TableColumnsToggle).
	const showInternalColumnsToggle =
		!!columnVisibilityKey && !isVisibilityControlled;
	const toggleableColumns = showInternalColumnsToggle
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
					"relative transition-opacity",
					isFetching && !isLoading && "opacity-80",
					className,
				)}
			>
				{isFetching && !isLoading && (
					<div
						className="absolute inset-x-0 top-0 z-10 h-0.5 animate-pulse bg-primary/60"
						aria-hidden
					/>
				)}
				<Table>
					<TableHeader>
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow
								key={headerGroup.id}
								className="hover:bg-transparent"
							>
								{headerGroup.headers.map((header) => {
									const meta = header.column.columnDef.meta;
									const canSort = header.column.getCanSort();
									const sorted = header.column.getIsSorted();

									return (
										<TableHead
											key={header.id}
											className={cn(meta?.className)}
											aria-sort={
												sorted === "asc"
													? "ascending"
													: sorted === "desc"
														? "descending"
														: undefined
											}
										>
											{header.isPlaceholder ? null : canSort ? (
												<button
													type="button"
													className={cn(
														"-mx-1.5 -my-0.5 inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wider transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
														sorted &&
															"text-foreground",
													)}
													onClick={header.column.getToggleSortingHandler()}
												>
													{flexRender(
														header.column.columnDef
															.header,
														header.getContext(),
													)}
													{sorted === "asc" ? (
														<ArrowUpIcon className="size-3 text-foreground" />
													) : sorted === "desc" ? (
														<ArrowDownIcon className="size-3 text-foreground" />
													) : (
														<ArrowUpDownIcon className="size-3 opacity-40" />
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
							<SkeletonRows columnCount={allColumns.length} />
						) : rows.length > 0 ? (
							rows.map((row) => (
								<Fragment key={row.id}>
									<TableRow
										data-state={
											row.getIsSelected()
												? "selected"
												: undefined
										}
										className={cn(
											"transition-colors hover:bg-accent/40",
											row.getIsExpanded() &&
												"bg-accent/30",
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
									{renderSubRow && row.getIsExpanded() && (
										<TableRow className="hover:bg-transparent">
											<TableCell
												colSpan={allColumns.length}
												className="bg-surface-subtle/40 p-0"
											>
												{renderSubRow(row)}
											</TableCell>
										</TableRow>
									)}
								</Fragment>
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
		</div>
	);
}
