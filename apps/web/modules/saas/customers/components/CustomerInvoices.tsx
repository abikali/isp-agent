"use client";

import {
	InvoiceFormDialog,
	useDeleteInvoice,
	useUnvoidInvoice,
	useVoidInvoice,
} from "@saas/billing/client";
import { useConfirmationAlert } from "@saas/shared/client";
import { useServerSorting } from "@shared/hooks/use-server-sorting";
import { formatCurrency, formatDate } from "@shared/lib/format";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/card";
import { DataTable } from "@ui/components/data-table";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@ui/components/dropdown-menu";
import {
	BanIcon,
	FileTextIcon,
	MoreHorizontalIcon,
	PencilIcon,
	PlusIcon,
	RotateCcwIcon,
	TrashIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const PAGE_SIZE = 10;

const sortByMap = {
	date: "invoiceDate",
	total: "total",
	totalTTC: "totalWithTax",
	status: "paid",
} as const satisfies Record<string, string>;

interface InvoiceRow {
	id: string;
	year: number;
	month: number;
	invoiceDate: string | Date;
	expiryDate: string | Date | null;
	total: number;
	tax: number;
	totalWithTax: number;
	paid: boolean;
	voidedAt: string | Date | null;
}

function cycleLabel(row: { month: number; year: number }) {
	return `${String(row.month).padStart(2, "0")}/${row.year}`;
}

export function CustomerInvoices({ customerId }: { customerId: string }) {
	const organizationId = useOrganizationId();
	const { confirm } = useConfirmationAlert();
	const [page, setPage] = useState(1);
	const { sorting, sortBy, sortOrder, onSortingChange } = useServerSorting(
		sortByMap,
		() => setPage(1),
	);
	const [createOpen, setCreateOpen] = useState(false);
	const [editInvoiceId, setEditInvoiceId] = useState<string | null>(null);

	const { data, isLoading } = useQuery(
		organizationId
			? orpc.customers.listInvoices.queryOptions({
					input: {
						organizationId,
						customerId,
						page,
						pageSize: PAGE_SIZE,
						sortBy,
						sortOrder,
					},
				})
			: disabledQuery(["customers", "listInvoices"]),
	);

	const invoices = (data?.invoices ?? []) as InvoiceRow[];
	const total = data?.total ?? 0;

	const deleteMutation = useDeleteInvoice();
	const voidMutation = useVoidInvoice();
	const unvoidMutation = useUnvoidInvoice();

	function handleDelete(row: InvoiceRow) {
		if (!organizationId) {
			return;
		}
		confirm({
			title: "Delete invoice?",
			message: `This permanently deletes the ${cycleLabel(row)} invoice.`,
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
			message: `The ${cycleLabel(row)} invoice will be excluded from collector lists and billing stats, but kept in history. You can restore it later.`,
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
			message: `The ${cycleLabel(row)} invoice will re-appear in collector lists and billing stats.`,
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
			id: "month",
			header: "Month",
			enableSorting: false,
			meta: { className: "font-mono text-xs" },
			cell: ({ row }) => cycleLabel(row.original),
		},
		{
			id: "date",
			header: "Date",
			accessorFn: (row) => row.invoiceDate,
			enableSorting: true,
			meta: { className: "text-xs" },
			cell: ({ row }) => formatDate(row.original.invoiceDate),
		},
		{
			id: "total",
			header: "Total",
			accessorFn: (row) => row.total,
			enableSorting: true,
			meta: { className: "text-right text-xs" },
			cell: ({ row }) => formatCurrency(row.original.total),
		},
		{
			id: "totalTTC",
			header: "Total (TTC)",
			accessorFn: (row) => row.totalWithTax,
			enableSorting: true,
			meta: { className: "text-right text-xs font-medium" },
			cell: ({ row }) => formatCurrency(row.original.totalWithTax),
		},
		{
			id: "status",
			header: "Status",
			accessorFn: (row) => row.paid,
			enableSorting: true,
			cell: ({ row }) => {
				if (row.original.voidedAt) {
					return (
						<Badge variant="secondary" className="text-xs">
							Voided
						</Badge>
					);
				}
				return (
					<Badge
						variant={row.original.paid ? "success" : "destructive"}
						className="text-xs"
					>
						{row.original.paid ? "Paid" : "Unpaid"}
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
								className="size-7"
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
									disabled={row.original.paid}
									onClick={() => handleVoid(row.original)}
								>
									<BanIcon className="mr-2 size-4" />
									Void
								</DropdownMenuItem>
							)}
							<DropdownMenuSeparator />
							<DropdownMenuItem
								className="text-destructive focus:text-destructive"
								disabled={row.original.paid}
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
		<Card>
			<CardHeader className="flex flex-row items-center justify-between space-y-0">
				<CardTitle className="flex items-center gap-2 text-base">
					<FileTextIcon className="size-4" />
					Invoices
					{total > 0 && (
						<Badge variant="secondary" className="ml-1">
							{total.toLocaleString()}
						</Badge>
					)}
				</CardTitle>
				<Button size="sm" onClick={() => setCreateOpen(true)}>
					<PlusIcon className="mr-1.5 size-4" />
					New Invoice
				</Button>
			</CardHeader>
			<CardContent>
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
				/>
			</CardContent>

			<InvoiceFormDialog
				open={createOpen}
				onOpenChange={setCreateOpen}
				mode={{ mode: "create", prefilledCustomerId: customerId }}
			/>

			<InvoiceFormDialog
				open={!!editInvoiceId}
				onOpenChange={(o) => !o && setEditInvoiceId(null)}
				mode={{ mode: "edit", invoiceId: editInvoiceId ?? "" }}
			/>
		</Card>
	);
}
