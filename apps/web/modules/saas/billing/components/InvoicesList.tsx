"use client";

import { EmptyState } from "@shared/components/EmptyState";
import { PageShell } from "@shared/components/PageShell";
import { SearchInput } from "@shared/components/SearchInput";
import { useServerSorting } from "@shared/hooks/use-server-sorting";
import { displayName } from "@shared/lib/display-name";
import { formatCurrency } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { useDebouncedValue } from "@tanstack/react-pacer";
import type { ColumnDef } from "@tanstack/react-table";
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
	FileTextIcon,
	MoreHorizontalIcon,
	PencilIcon,
	PlusIcon,
	TrashIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
	useDeleteInvoice,
	useInvoices,
	useMonthFilter,
} from "../hooks/use-billing";
import { BillingCycleSelect } from "./BillingCycleSelect";
import { CreateInvoiceDialog } from "./CreateInvoiceDialog";
import { EditInvoiceDialog } from "./EditInvoiceDialog";

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

export function InvoicesList() {
	const organizationId = useOrganizationId();
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
	const [deleteInvoice, setDeleteInvoice] = useState<InvoiceRow | null>(null);

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

	function confirmDelete() {
		if (!deleteInvoice || !organizationId) {
			return;
		}
		deleteMutation.mutate(
			{
				organizationId,
				invoiceId: deleteInvoice.id,
			},
			{
				onSuccess: () => {
					toast.success("Invoice deleted");
					setDeleteInvoice(null);
				},
				onError: (err) => {
					toast.error(err.message || "Failed to delete invoice");
				},
			},
		);
	}

	const columns = useMemo<ColumnDef<InvoiceRow, unknown>[]>(
		() => [
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
				cell: ({ row }) =>
					new Date(row.original.invoiceDate).toLocaleDateString(
						"en-GB",
					),
			},
			{
				id: "expiry",
				header: "Due",
				accessorFn: (row) => row.expiryDate,
				enableSorting: true,
				meta: { className: "text-xs" },
				cell: ({ row }) =>
					row.original.expiryDate
						? new Date(row.original.expiryDate).toLocaleDateString(
								"en-GB",
							)
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
				cell: ({ row }) => (
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
							<DropdownMenuSeparator />
							<DropdownMenuItem
								className="text-destructive focus:text-destructive"
								disabled={!!row.original.payment}
								onClick={() => setDeleteInvoice(row.original)}
							>
								<TrashIcon className="mr-2 size-4" />
								Delete
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				),
			},
		],
		[],
	);

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
			<div className="space-y-4">
				<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
				</div>

				<DataTable
					columns={columns}
					data={invoices}
					sorting={sorting}
					onSortingChange={onSortingChange}
					pagination={{
						totalItems: total,
						currentPage: page,
						itemsPerPage: PAGE_SIZE,
						onPageChange: setPage,
					}}
					isLoading={isLoading}
					emptyState={
						<EmptyState
							icon={FileTextIcon}
							title="No invoices"
							description="No invoices match your filters."
						/>
					}
				/>
			</div>

			<CreateInvoiceDialog
				open={createOpen}
				onOpenChange={setCreateOpen}
			/>
			<EditInvoiceDialog
				invoiceId={editInvoiceId}
				onClose={() => setEditInvoiceId(null)}
			/>

			<AlertDialog
				open={!!deleteInvoice}
				onOpenChange={(open) => !open && setDeleteInvoice(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete invoice?</AlertDialogTitle>
						<AlertDialogDescription>
							This will permanently delete the{" "}
							{deleteInvoice
								? `${String(deleteInvoice.month).padStart(2, "0")}/${deleteInvoice.year}`
								: ""}{" "}
							invoice for{" "}
							{deleteInvoice
								? displayName(
										deleteInvoice.customer.firstName,
										deleteInvoice.customer.lastName,
									)
								: ""}
							.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={confirmDelete}
							disabled={deleteMutation.isPending}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</PageShell>
	);
}
