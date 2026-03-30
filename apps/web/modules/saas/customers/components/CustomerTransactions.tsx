"use client";

import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/card";
import { DataTable } from "@ui/components/data-table";
import { ReceiptIcon } from "lucide-react";
import { useMemo, useState } from "react";

const PAGE_SIZE = 10;

interface TransactionRow {
	id: string;
	operationDate: string | Date;
	credit: number;
	debit: number;
	notes: string | null;
}

export function CustomerTransactions({ customerId }: { customerId: string }) {
	const organizationId = useOrganizationId();
	const [page, setPage] = useState(1);

	const { data, isLoading } = useQuery(
		organizationId
			? orpc.customers.listTransactions.queryOptions({
					input: {
						organizationId,
						customerId,
						page,
						pageSize: PAGE_SIZE,
					},
				})
			: disabledQuery(["customers", "listTransactions"]),
	);

	const transactions = data?.transactions ?? [];
	const total = data?.total ?? 0;

	const columns = useMemo<ColumnDef<TransactionRow, unknown>[]>(
		() => [
			{
				id: "date",
				header: "Date",
				enableSorting: false,
				meta: { className: "text-xs" },
				cell: ({ row }) =>
					new Date(row.original.operationDate).toLocaleDateString(),
			},
			{
				id: "credit",
				header: "Credit",
				enableSorting: false,
				meta: { className: "text-right text-xs" },
				cell: ({ row }) =>
					row.original.credit > 0 ? (
						<span className="text-green-600">
							+${row.original.credit.toFixed(2)}
						</span>
					) : (
						"-"
					),
			},
			{
				id: "debit",
				header: "Debit",
				enableSorting: false,
				meta: { className: "text-right text-xs" },
				cell: ({ row }) =>
					row.original.debit > 0 ? (
						<span className="text-red-600">
							-${row.original.debit.toFixed(2)}
						</span>
					) : (
						"-"
					),
			},
			{
				id: "notes",
				header: "Notes",
				enableSorting: false,
				meta: {
					className:
						"hidden max-w-[200px] truncate text-xs text-muted-foreground sm:table-cell",
				},
				cell: ({ row }) => row.original.notes || "-",
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
					<ReceiptIcon className="size-4" />
					Financial Transactions
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
					data={transactions}
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
