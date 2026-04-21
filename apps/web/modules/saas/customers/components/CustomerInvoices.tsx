"use client";

import { useServerSorting } from "@shared/hooks/use-server-sorting";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/card";
import { DataTable } from "@ui/components/data-table";
import { FileTextIcon } from "lucide-react";
import { useMemo, useState } from "react";

const PAGE_SIZE = 10;

const sortByMap = {
	date: "invoiceDate",
	total: "total",
	totalTTC: "totalWithTax",
	status: "paid",
} as const satisfies Record<string, string>;

interface InvoiceRow {
	id: string;
	invoiceDate: string | Date;
	total: number;
	tax: number;
	totalWithTax: number;
	paid: boolean;
}

export function CustomerInvoices({ customerId }: { customerId: string }) {
	const organizationId = useOrganizationId();
	const [page, setPage] = useState(1);
	const { sorting, sortBy, sortOrder, onSortingChange } = useServerSorting(
		sortByMap,
		() => setPage(1),
	);

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

	const invoices = data?.invoices ?? [];
	const total = data?.total ?? 0;

	const columns = useMemo<ColumnDef<InvoiceRow, unknown>[]>(
		() => [
			{
				id: "date",
				header: "Date",
				accessorFn: (row) => row.invoiceDate,
				enableSorting: true,
				meta: { className: "text-xs" },
				cell: ({ row }) =>
					new Date(row.original.invoiceDate).toLocaleDateString(
						"en-GB",
					),
			},
			{
				id: "total",
				header: "Total",
				accessorFn: (row) => row.total,
				enableSorting: true,
				meta: { className: "text-right text-xs" },
				cell: ({ row }) => `$${row.original.total.toFixed(2)}`,
			},
			{
				id: "tax",
				header: "Tax",
				enableSorting: false,
				meta: { className: "text-right text-xs hidden sm:table-cell" },
				cell: ({ row }) => `$${row.original.tax.toFixed(2)}`,
			},
			{
				id: "totalTTC",
				header: "Total (TTC)",
				accessorFn: (row) => row.totalWithTax,
				enableSorting: true,
				meta: { className: "text-right text-xs font-medium" },
				cell: ({ row }) => `$${row.original.totalWithTax.toFixed(2)}`,
			},
			{
				id: "status",
				header: "Status",
				accessorFn: (row) => row.paid,
				enableSorting: true,
				cell: ({ row }) => (
					<Badge
						variant={row.original.paid ? "success" : "destructive"}
						className="text-xs"
					>
						{row.original.paid ? "Paid" : "Unpaid"}
					</Badge>
				),
			},
		],
		[],
	);

	if (!isLoading && total === 0) {
		return null;
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base">
					<FileTextIcon className="size-4" />
					Invoices
					{total > 0 && (
						<Badge variant="secondary" className="ml-1">
							{total.toLocaleString()}
						</Badge>
					)}
				</CardTitle>
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
		</Card>
	);
}
