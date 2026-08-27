"use client";

import { NoteCell } from "@shared/components/NoteCell";
import { formatCurrency, formatDate } from "@shared/lib/format";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@ui/components/alert-dialog";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Card, CardContent } from "@ui/components/card";
import { DataTable } from "@ui/components/data-table";
import { HandCoinsIcon, TrashIcon } from "lucide-react";
import { useMemo } from "react";

const COLLECTION_TYPE_LABELS: Record<string, string> = {
	HANDOFF: "Handoff",
	EXPENSE_DEDUCTION: "Expense",
	STOCK_RECEIVED: "Stock Received",
	INSTALLATION_COST: "Installation",
	DEALER_PAYMENT: "Dealer Payment",
	ADMIN_TRANSFER: "Transfer",
	NEW_USER_SETUP: "New User Setup",
	OTHER: "Other",
};

interface Collection {
	id: string;
	amount: number;
	type: string;
	notes: string | null;
	externalBillingId: number | null;
	collectedAt: string | Date;
	collector: { name: string };
	receivedBy: { name: string } | null;
}

const HANDOFFS_PER_PAGE = 10;

export function HandoffsTable({
	collections,
	total,
	page,
	onPageChange,
	onDelete,
	sorting,
	onSortingChange,
}: {
	collections: Collection[];
	total: number;
	page: number;
	onPageChange: (page: number) => void;
	onDelete: (id: string) => void;
	sorting: SortingState;
	onSortingChange: (sorting: SortingState) => void;
}) {
	const columns: ColumnDef<Collection, unknown>[] = useMemo(
		() => [
			{
				id: "type",
				header: "Type",
				accessorFn: (row) => row.type,
				enableSorting: true,
				cell: ({ row }) => (
					<Badge variant="outline" className="text-xs font-normal">
						{COLLECTION_TYPE_LABELS[row.original.type] ??
							row.original.type}
					</Badge>
				),
			},
			{
				id: "amount",
				header: "Amount",
				accessorFn: (row) => row.amount,
				enableSorting: true,
				cell: ({ row }) => (
					<span
						className={`font-semibold tabular-nums ${row.original.amount < 0 ? "text-red-600 dark:text-red-400" : ""}`}
					>
						{formatCurrency(row.original.amount)}
					</span>
				),
			},
			{
				id: "collectedAt",
				header: "Date",
				accessorFn: (row) => row.collectedAt,
				enableSorting: true,
				cell: ({ row }) => (
					<span className="text-muted-foreground">
						{formatDate(row.original.collectedAt)}
					</span>
				),
			},
			{
				id: "notes",
				header: "Note",
				enableSorting: false,
				cell: ({ row }) => <NoteCell note={row.original.notes} />,
			},
			{
				id: "receivedBy",
				header: "Received By",
				enableSorting: false,
				cell: ({ row }) => (
					<span className="text-muted-foreground">
						{row.original.receivedBy?.name ?? "\u2014"}
					</span>
				),
			},
			{
				id: "actions",
				header: "",
				meta: { className: "w-12" },
				// Synced rows (externalBillingId set) re-sync on the next import,
				// so they aren't deletable here — only native app entries are.
				cell: ({ row }) =>
					row.original.externalBillingId !== null ? null : (
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="size-8 text-destructive"
								>
									<TrashIcon className="size-3.5" />
								</Button>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>
										Delete handoff record?
									</AlertDialogTitle>
									<AlertDialogDescription>
										This will permanently delete the{" "}
										{formatCurrency(row.original.amount)}{" "}
										handoff record.
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>
										Cancel
									</AlertDialogCancel>
									<AlertDialogAction
										onClick={() =>
											onDelete(row.original.id)
										}
									>
										Delete
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					),
			},
		],
		[onDelete],
	);

	return (
		<DataTable
			columns={columns}
			data={collections}
			sorting={sorting}
			onSortingChange={onSortingChange}
			emptyState={
				<Card>
					<CardContent className="flex flex-col items-center gap-2 py-12 text-center">
						<HandCoinsIcon className="size-10 text-muted-foreground/30" />
						<p className="text-sm text-muted-foreground">
							No handoff records yet.
						</p>
					</CardContent>
				</Card>
			}
			pagination={
				total > HANDOFFS_PER_PAGE
					? {
							totalItems: total,
							currentPage: page,
							itemsPerPage: HANDOFFS_PER_PAGE,
							onPageChange,
						}
					: undefined
			}
		/>
	);
}
