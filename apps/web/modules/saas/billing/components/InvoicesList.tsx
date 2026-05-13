"use client";

import { useConfirmationAlert } from "@saas/shared/client";
import {
	ContentCard,
	ContentCardToolbar,
} from "@shared/components/ContentCard";
import { EmptyState } from "@shared/components/EmptyState";
import { PageShell } from "@shared/components/PageShell";
import { SearchInput } from "@shared/components/SearchInput";
import { useServerSorting } from "@shared/hooks/use-server-sorting";
import { displayName } from "@shared/lib/display-name";
import { formatCurrency, formatDate } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { useDebouncedValue } from "@tanstack/react-pacer";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import {
	BanIcon,
	FileTextIcon,
	MoreHorizontalIcon,
	PencilIcon,
	PlusIcon,
	RotateCcwIcon,
	TrashIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
	useDeleteInvoice,
	useInvoices,
	useMonthFilter,
	useUnvoidInvoice,
	useVoidInvoice,
	useVoidInvoices,
} from "../hooks/use-billing";
import { BillingCycleSelect } from "./BillingCycleSelect";
import { InvoiceFormDialog } from "./InvoiceFormDialog";

const PAGE_SIZE = 25;

const SORT_BY_MAP = {
	date: "invoiceDate",
	total: "total",
	totalTTC: "totalWithTax",
	status: "paid",
	expiry: "expiryDate",
} as const satisfies Record<
	string,
	"invoiceDate" | "total" | "totalWithTax" | "paid" | "expiryDate"
>;

interface InvoiceRow {
	id: string;
	year: number;
	month: number;
	invoiceDate: string | Date;
	expiryDate: string | Date | null;
	total: number;
	discount: number;
	tax: number;
	totalWithTax: number;
	paid: boolean;
	voidedAt: string | Date | null;
	voidReason: string | null;
	createdAt: string | Date;
	customer: {
		id: string;
		accountNumber: string;
		firstName: string | null;
		lastName: string | null;
		username: string | null;
		mobile: string | null;
		phone: string | null;
	};
	payment: {
		id: string;
		paidAmount: number;
		paidAt: string | Date;
		collector: { id: string; name: string } | null;
	} | null;
}

function rowSummary(row: InvoiceRow) {
	return `${String(row.month).padStart(2, "0")}/${row.year} invoice for ${displayName(
		row.customer.firstName,
		row.customer.lastName,
	)}`;
}

export function InvoicesList() {
	const organizationId = useOrganizationId();
	const { confirm } = useConfirmationAlert();
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 300 });
	const [status, setStatus] = useState<"all" | "paid" | "unpaid">("all");
	const [page, setPage] = useState(1);
	const { sorting, sortBy, sortOrder, onSortingChange } = useServerSorting(
		SORT_BY_MAP,
		() => setPage(1),
	);
	const { monthFilter, setMonthFilter, options, isAll } = useMonthFilter();
	const selected = isAll
		? undefined
		: options.find((o) => o.value === monthFilter);
	const [createOpen, setCreateOpen] = useState(false);
	const [editInvoiceId, setEditInvoiceId] = useState<string | null>(null);
	const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

	const { data, isLoading } = useInvoices({
		search: debouncedSearch || undefined,
		year: selected?.year,
		month: selected?.month,
		status,
		page,
		pageSize: PAGE_SIZE,
		sortBy,
		sortOrder,
	});
	const invoices = (data?.invoices ?? []) as InvoiceRow[];
	const total = data?.total ?? 0;

	const deleteMutation = useDeleteInvoice();
	const voidMutation = useVoidInvoice();
	const voidManyMutation = useVoidInvoices();
	const unvoidMutation = useUnvoidInvoice();

	const selectedIds = useMemo(
		() => Object.keys(rowSelection),
		[rowSelection],
	);
	const selectedCount = selectedIds.length;

	function handleVoidSelected() {
		if (!organizationId || selectedCount === 0) {
			return;
		}
		confirm({
			title: `Void ${selectedCount} invoice${selectedCount === 1 ? "" : "s"}?`,
			message:
				"The selected invoices will be excluded from collector lists and billing stats, but kept in history. You can restore them later.",
			confirmLabel: "Void",
			onConfirm: async () => {
				try {
					const result = await voidManyMutation.mutateAsync({
						organizationId,
						invoiceIds: selectedIds,
					});
					setRowSelection({});
					toast.success(
						`${result.count} invoice${result.count === 1 ? "" : "s"} voided`,
					);
				} catch (err) {
					toast.error(
						err instanceof Error
							? err.message
							: "Failed to void invoices",
					);
				}
			},
		});
	}

	function handleDelete(row: InvoiceRow) {
		if (!organizationId) {
			return;
		}
		confirm({
			title: "Delete invoice?",
			message: `This will permanently delete the ${rowSummary(row)}.`,
			confirmLabel: "Delete",
			destructive: true,
			onConfirm: async () => {
				try {
					await deleteMutation.mutateAsync({
						organizationId,
						invoiceId: row.id,
					});
					toast.success("Invoice deleted");
				} catch (err) {
					toast.error(
						err instanceof Error
							? err.message
							: "Failed to delete invoice",
					);
				}
			},
		});
	}

	function handleVoid(row: InvoiceRow) {
		if (!organizationId) {
			return;
		}
		confirm({
			title: "Void invoice?",
			message: `The ${rowSummary(row)} will be excluded from collector lists and billing stats, but kept in history. You can restore it later.`,
			confirmLabel: "Void",
			onConfirm: async () => {
				try {
					await voidMutation.mutateAsync({
						organizationId,
						invoiceId: row.id,
					});
					toast.success("Invoice voided");
				} catch (err) {
					toast.error(
						err instanceof Error
							? err.message
							: "Failed to void invoice",
					);
				}
			},
		});
	}

	function handleUnvoid(row: InvoiceRow) {
		if (!organizationId) {
			return;
		}
		confirm({
			title: "Restore invoice?",
			message: `The ${rowSummary(row)} will re-appear in collector lists and billing stats.`,
			confirmLabel: "Restore",
			onConfirm: async () => {
				try {
					await unvoidMutation.mutateAsync({
						organizationId,
						invoiceId: row.id,
					});
					toast.success("Invoice restored");
				} catch (err) {
					toast.error(
						err instanceof Error
							? err.message
							: "Failed to restore invoice",
					);
				}
			},
		});
	}

	const columns: ColumnDef<InvoiceRow, unknown>[] = [
		{
			id: "customer",
			header: "Customer",
			enableSorting: false,
			cell: ({ row }) => {
				const c = row.original.customer;
				return (
					<div className="space-y-0.5">
						<div className="font-medium">
							{displayName(c.firstName, c.lastName)}
						</div>
						<div className="text-xs text-muted-foreground">
							{c.username ?? c.accountNumber}
						</div>
					</div>
				);
			},
		},
		{
			id: "month",
			header: "Month",
			enableSorting: false,
			cell: ({ row }) => (
				<span className="text-sm font-mono">
					{String(row.original.month).padStart(2, "0")}/
					{row.original.year}
				</span>
			),
		},
		{
			id: "date",
			header: "Invoice Date",
			accessorFn: (row) => row.invoiceDate,
			enableSorting: true,
			meta: { className: "text-xs" },
			cell: ({ row }) => formatDate(row.original.invoiceDate),
		},
		{
			id: "expiry",
			header: "Due",
			accessorFn: (row) => row.expiryDate,
			enableSorting: true,
			meta: { className: "text-xs" },
			cell: ({ row }) =>
				row.original.expiryDate
					? formatDate(row.original.expiryDate)
					: "—",
		},
		{
			id: "total",
			header: "Total",
			accessorFn: (row) => row.total,
			enableSorting: true,
			meta: { className: "text-right" },
			cell: ({ row }) => formatCurrency(row.original.total),
		},
		{
			id: "totalTTC",
			header: "Total (TTC)",
			accessorFn: (row) => row.totalWithTax,
			enableSorting: true,
			meta: { className: "text-right font-medium" },
			cell: ({ row }) => formatCurrency(row.original.totalWithTax),
		},
		{
			id: "status",
			header: "Status",
			accessorFn: (row) => row.paid,
			enableSorting: true,
			cell: ({ row }) => {
				if (row.original.voidedAt) {
					return <Badge variant="secondary">Voided</Badge>;
				}
				const paid = !!row.original.payment || row.original.paid;
				return (
					<Badge variant={paid ? "success" : "destructive"}>
						{paid ? "Paid" : "Unpaid"}
					</Badge>
				);
			},
		},
		{
			id: "actions",
			enableSorting: false,
			cell: ({ row }) => {
				const isVoided = !!row.original.voidedAt;
				return (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="size-8"
							>
								<MoreHorizontalIcon className="size-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem
								onClick={() =>
									setEditInvoiceId(row.original.id)
								}
							>
								<PencilIcon className="mr-2 size-4" />
								Edit
							</DropdownMenuItem>
							{isVoided ? (
								<DropdownMenuItem
									onClick={() => handleUnvoid(row.original)}
								>
									<RotateCcwIcon className="mr-2 size-4" />
									Restore
								</DropdownMenuItem>
							) : (
								<DropdownMenuItem
									disabled={!!row.original.payment}
									onClick={() => handleVoid(row.original)}
								>
									<BanIcon className="mr-2 size-4" />
									Void
								</DropdownMenuItem>
							)}
							<DropdownMenuSeparator />
							<DropdownMenuItem
								className="text-destructive focus:text-destructive"
								disabled={!!row.original.payment}
								onClick={() => handleDelete(row.original)}
							>
								<TrashIcon className="mr-2 size-4" />
								Delete
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				);
			},
		},
	];

	return (
		<PageShell
			title="Invoices"
			description={`${total} invoice${total !== 1 ? "s" : ""}`}
			actions={
				<Button onClick={() => setCreateOpen(true)}>
					<PlusIcon className="mr-2 size-4" />
					New Invoice
				</Button>
			}
		>
			{selectedCount > 0 && (
				<div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/50 px-4 py-2">
					<span className="text-sm text-muted-foreground">
						{selectedCount} selected
					</span>
					<Button
						size="sm"
						variant="outline"
						disabled={voidManyMutation.isPending}
						onClick={handleVoidSelected}
					>
						<BanIcon className="mr-2 size-4" />
						Void selected ({selectedCount})
					</Button>
				</div>
			)}

			<ContentCard>
				<ContentCardToolbar>
					<SearchInput
						value={search}
						onChange={setSearch}
						placeholder="Search customers..."
						className="sm:max-w-xs"
					/>
					<BillingCycleSelect
						options={options}
						value={monthFilter}
						onValueChange={setMonthFilter}
						allLabel="All months"
					/>
					<Select
						value={status}
						onValueChange={(v) => {
							setStatus(v as typeof status);
							setPage(1);
						}}
					>
						<SelectTrigger className="w-40">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All</SelectItem>
							<SelectItem value="unpaid">Unpaid</SelectItem>
							<SelectItem value="paid">Paid</SelectItem>
						</SelectContent>
					</Select>
				</ContentCardToolbar>

				<DataTable
					columns={columns}
					data={invoices}
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
					enableRowSelection={(row) =>
						!row.original.voidedAt && !row.original.payment
					}
					rowSelection={rowSelection}
					onRowSelectionChange={setRowSelection}
					getRowId={(row) => row.id}
					emptyState={
						<EmptyState
							icon={FileTextIcon}
							title="No invoices"
							description="No invoices match your filters."
						/>
					}
				/>
			</ContentCard>

			<InvoiceFormDialog
				open={createOpen}
				onOpenChange={setCreateOpen}
				mode={{ mode: "create" }}
			/>
			<InvoiceFormDialog
				open={!!editInvoiceId}
				onOpenChange={(o) => !o && setEditInvoiceId(null)}
				mode={{
					mode: "edit",
					invoiceId: editInvoiceId ?? "",
				}}
			/>
		</PageShell>
	);
}
