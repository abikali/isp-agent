"use client";

import {
	ContentCard,
	ContentCardToolbar,
} from "@shared/components/ContentCard";
import { EmptyState } from "@shared/components/EmptyState";
import { FilterBar } from "@shared/components/FilterBar";
import { PageShell } from "@shared/components/PageShell";
import { PermissionGate } from "@shared/components/PermissionGate";
import { formatCurrency } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Alert, AlertDescription, AlertTitle } from "@ui/components/alert";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { DataTable } from "@ui/components/data-table";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@ui/components/dropdown-menu";
import { Switch } from "@ui/components/switch";
import {
	AlertTriangleIcon,
	BoxesIcon,
	HistoryIcon,
	MoreHorizontalIcon,
	PackagePlusIcon,
	PencilIcon,
	PlusIcon,
	SendIcon,
	TrashIcon,
	UndoIcon,
	UsersIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
	useDeleteStockItem,
	useStockItems,
	useStockRefundRequests,
	useUpdateStockItem,
} from "../hooks/use-stock";
import { AddQuantityDialog } from "./AddQuantityDialog";
import { DeliverToWorkerDialog } from "./DeliverToWorkerDialog";
import { RefundRequestsDialog } from "./RefundRequestsDialog";
import { StockItemDialog } from "./StockItemDialog";
import { WorkerAllocationsDialog } from "./WorkerAllocationsDialog";

export type StockItem = ReturnType<typeof useStockItems>["items"][number];

// react-doctor-disable-next-line react-doctor/no-giant-component, react-doctor/prefer-useReducer -- cohesive stock data-table feature (filters, columns, dialogs) sharing one state surface; the useState slices are independent UI toggles, not one related state machine
export function StockList({ organizationSlug }: { organizationSlug: string }) {
	const organizationId = useOrganizationId();
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 200 });
	const [lowStockOnly, setLowStockOnly] = useState(false);

	const { items } = useStockItems({
		search: debouncedSearch || undefined,
		lowStockOnly: lowStockOnly || undefined,
	});

	const updateItem = useUpdateStockItem();
	const deleteItem = useDeleteStockItem();
	const { pendingCount: pendingRefundCount } = useStockRefundRequests({
		status: "PENDING",
	});

	const [showCreate, setShowCreate] = useState(false);
	const [showRefunds, setShowRefunds] = useState(false);
	const [editingItem, setEditingItem] = useState<StockItem | null>(null);
	const [addQtyItem, setAddQtyItem] = useState<StockItem | null>(null);
	const [deliverItem, setDeliverItem] = useState<StockItem | null>(null);
	const [returnItem, setReturnItem] = useState<StockItem | null>(null);
	const [showWorkerView, setShowWorkerView] = useState(false);

	const lowStockItems = useMemo(
		() => items.filter((i) => i.isLowStock),
		[items],
	);

	const activeFilterCount = lowStockOnly ? 1 : 0;

	function resetFilters() {
		setSearch("");
		setLowStockOnly(false);
	}

	const columns = useMemo<ColumnDef<StockItem, unknown>[]>(
		() => [
			{
				accessorKey: "name",
				header: "Item",
				cell: ({ row }) => (
					<div className="flex items-center gap-2">
						<p className="font-medium">{row.original.name}</p>
						{row.original.isLowStock && (
							<Badge variant="error" className="gap-1">
								<AlertTriangleIcon className="size-3" />
								Low
							</Badge>
						)}
					</div>
				),
			},
			{
				accessorKey: "quantity",
				header: "In Stock",
				cell: ({ row }) => (
					<span className="font-mono tabular-nums text-sm">
						{row.original.quantity}
					</span>
				),
			},
			{
				accessorKey: "workerQuantity",
				header: "With Workers",
				meta: { className: "hidden sm:table-cell" },
				cell: ({ row }) => (
					<span className="font-mono tabular-nums text-sm text-muted-foreground">
						{row.original.workerQuantity}
					</span>
				),
			},
			{
				accessorKey: "costPrice",
				header: "Cost",
				meta: { className: "hidden md:table-cell" },
				cell: ({ row }) => (
					<span className="font-mono tabular-nums text-sm">
						{formatCurrency(row.original.costPrice)}
					</span>
				),
			},
			{
				accessorKey: "sellPrice",
				header: "Sell",
				cell: ({ row }) => (
					<span className="font-mono tabular-nums text-sm">
						{formatCurrency(row.original.sellPrice)}
					</span>
				),
			},
			{
				id: "alert",
				header: "Alert",
				enableSorting: false,
				meta: { className: "hidden md:table-cell" },
				cell: ({ row }) => {
					const item = row.original;
					return (
						<div className="flex items-center gap-2">
							<Switch
								checked={item.alertEnabled}
								onCheckedChange={(checked) => {
									if (!organizationId) {
										return;
									}
									updateItem.mutate({
										organizationId,
										id: item.id,
										alertEnabled: checked,
									});
								}}
								aria-label="Toggle low-stock alert"
							/>
							{item.alertThreshold !== null && (
								<span className="text-xs text-muted-foreground tabular-nums">
									≤ {item.alertThreshold}
								</span>
							)}
						</div>
					);
				},
			},
			{
				id: "showInUninstall",
				header: "Uninstall",
				enableSorting: false,
				meta: { className: "hidden md:table-cell" },
				cell: ({ row }) => {
					const item = row.original;
					return (
						<Switch
							checked={item.showInUninstall}
							onCheckedChange={(checked) => {
								if (!organizationId) {
									return;
								}
								updateItem.mutate({
									organizationId,
									id: item.id,
									showInUninstall: checked,
								});
							}}
							aria-label="Toggle show on uninstall"
						/>
					);
				},
			},
			{
				id: "actions",
				enableSorting: false,
				cell: ({ row }) => {
					const item = row.original;
					return (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="size-8"
								>
									<MoreHorizontalIcon className="size-4" />
									<span className="sr-only">Actions</span>
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem
									onClick={() => setAddQtyItem(item)}
								>
									<PackagePlusIcon className="mr-2 size-4" />
									Add quantity
								</DropdownMenuItem>
								<DropdownMenuItem
									onClick={() => setDeliverItem(item)}
									disabled={item.quantity <= 0}
								>
									<SendIcon className="mr-2 size-4" />
									Deliver to worker
								</DropdownMenuItem>
								<DropdownMenuItem
									onClick={() => setReturnItem(item)}
									disabled={item.workerQuantity <= 0}
								>
									<UndoIcon className="mr-2 size-4" />
									Return from worker
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									onClick={() => setEditingItem(item)}
								>
									<PencilIcon className="mr-2 size-4" />
									Edit
								</DropdownMenuItem>
								<DropdownMenuItem
									className="text-destructive focus:text-destructive"
									onClick={async () => {
										if (!organizationId) {
											return;
										}
										if (
											!confirm(
												`Delete "${item.name}"? This cannot be undone.`,
											)
										) {
											return;
										}
										try {
											await deleteItem.mutateAsync({
												organizationId,
												id: item.id,
											});
											toast.success("Item deleted");
										} catch (error) {
											toast.error(
												error instanceof Error
													? error.message
													: "Failed to delete item",
											);
										}
									}}
								>
									<TrashIcon className="mr-2 size-4" />
									Delete
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					);
				},
			},
		],
		[organizationId, updateItem, deleteItem],
	);

	return (
		<PageShell
			title="Stock"
			description="Manage warehouse inventory, deliver equipment to workers, and track every movement."
			actions={
				<div className="flex gap-2">
					<Button
						variant="outline"
						onClick={() => setShowRefunds(true)}
					>
						<UndoIcon className="mr-2 size-4" />
						Refund requests
						{pendingRefundCount > 0 && (
							<Badge variant="error" className="ml-2">
								{pendingRefundCount}
							</Badge>
						)}
					</Button>
					<Button
						variant="outline"
						onClick={() => setShowWorkerView(true)}
					>
						<UsersIcon className="mr-2 size-4" />
						Worker stock
					</Button>
					<Button variant="outline" asChild>
						<Link
							to="/app/$organizationSlug/stock/log"
							params={{ organizationSlug }}
							preload="intent"
						>
							<HistoryIcon className="mr-2 size-4" />
							Stock log
						</Link>
					</Button>
					<PermissionGate resource="inventory" action="create">
						<Button onClick={() => setShowCreate(true)}>
							<PlusIcon className="mr-2 size-4" />
							Add item
						</Button>
					</PermissionGate>
				</div>
			}
		>
			{lowStockItems.length > 0 && (
				<Alert variant="error" className="mb-4">
					<AlertTriangleIcon className="size-4" />
					<AlertTitle>Low stock</AlertTitle>
					<AlertDescription>
						{lowStockItems
							.map((i) => `${i.name} (${i.quantity})`)
							.join(", ")}
					</AlertDescription>
				</Alert>
			)}

			<ContentCard>
				<ContentCardToolbar>
					<FilterBar
						bare
						searchPlaceholder="Search items..."
						searchValue={search}
						onSearchChange={setSearch}
						activeFilterCount={activeFilterCount}
						onReset={resetFilters}
					>
						<Button
							variant={lowStockOnly ? "primary" : "outline"}
							size="sm"
							onClick={() => setLowStockOnly(!lowStockOnly)}
						>
							<AlertTriangleIcon className="mr-1.5 size-3.5" />
							Low stock
						</Button>
					</FilterBar>
				</ContentCardToolbar>

				<DataTable
					columns={columns}
					data={items}
					pageSize={20}
					emptyState={
						items.length === 0 && !activeFilterCount && !search ? (
							<EmptyState
								icon={BoxesIcon}
								title="No stock items yet"
								description="Add your first inventory item — routers, cables, antennas."
								action={
									<PermissionGate
										resource="inventory"
										action="create"
									>
										<Button
											onClick={() => setShowCreate(true)}
										>
											<PlusIcon className="mr-2 size-4" />
											Add item
										</Button>
									</PermissionGate>
								}
							/>
						) : (
							<EmptyState
								icon={BoxesIcon}
								title="No results found"
								description="Try adjusting your search or filters."
							/>
						)
					}
				/>
			</ContentCard>

			<StockItemDialog
				open={showCreate}
				onOpenChange={setShowCreate}
				item={null}
			/>
			{editingItem && (
				<StockItemDialog
					open={!!editingItem}
					onOpenChange={(open) => {
						if (!open) {
							setEditingItem(null);
						}
					}}
					item={editingItem}
				/>
			)}
			{addQtyItem && (
				<AddQuantityDialog
					open={!!addQtyItem}
					onOpenChange={(open) => {
						if (!open) {
							setAddQtyItem(null);
						}
					}}
					item={addQtyItem}
				/>
			)}
			{deliverItem && (
				<DeliverToWorkerDialog
					open={!!deliverItem}
					onOpenChange={(open) => {
						if (!open) {
							setDeliverItem(null);
						}
					}}
					item={deliverItem}
					mode="deliver"
				/>
			)}
			{returnItem && (
				<DeliverToWorkerDialog
					open={!!returnItem}
					onOpenChange={(open) => {
						if (!open) {
							setReturnItem(null);
						}
					}}
					item={returnItem}
					mode="return"
				/>
			)}
			<WorkerAllocationsDialog
				open={showWorkerView}
				onOpenChange={setShowWorkerView}
			/>
			<RefundRequestsDialog
				open={showRefunds}
				onOpenChange={setShowRefunds}
			/>
		</PageShell>
	);
}
