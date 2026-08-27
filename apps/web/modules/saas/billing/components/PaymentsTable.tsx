"use client";

import { displayName } from "@shared/lib/display-name";
import { formatCurrency, formatDate } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Card, CardContent } from "@ui/components/card";
import { DataTable } from "@ui/components/data-table";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@ui/components/dropdown-menu";
import { MoreHorizontalIcon, ReceiptTextIcon, TrashIcon } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { useDeletePayment } from "../hooks/use-billing";
import {
	formatCycleShort,
	getPaymentStatusLabel,
	getPaymentStatusVariant,
	NOTE_CATEGORY_LABELS,
} from "../lib/billing-utils";

interface Payment {
	id: string;
	paidAmount: number;
	accountPrice: number;
	discount: number;
	stoppedAccount: boolean;
	debtAccount?: boolean;
	noteCategory: string | null;
	notes: string | null;
	paidAt: string | Date;
	customer: {
		id: string;
		firstName: string | null;
		lastName: string | null;
		username: string | null;
		groupName: string | null;
	};
	billingMonth: { year: number; month: number } | null;
}

function getPaymentColumns(actions: {
	onDelete: (paymentId: string) => void;
}): ColumnDef<Payment, unknown>[] {
	return [
		{
			accessorKey: "customer",
			header: "Customer",
			cell: ({ row }) => (
				<div className="font-medium">
					{displayName(
						row.original.customer.firstName,
						row.original.customer.lastName,
					)}
					{row.original.customer.username && (
						<span className="ml-1.5 text-xs text-muted-foreground">
							{row.original.customer.username}
						</span>
					)}
				</div>
			),
		},
		{
			accessorKey: "area",
			header: "Area",
			cell: ({ row }) => (
				<span className="text-muted-foreground">
					{row.original.customer.groupName ?? "\u2014"}
				</span>
			),
		},
		{
			accessorKey: "paidAmount",
			header: "Amount",
			meta: { className: "text-right" },
			cell: ({ row }) => (
				<span className="text-right block font-semibold tabular-nums">
					{formatCurrency(row.original.paidAmount)}
				</span>
			),
		},
		{
			accessorKey: "stoppedAccount",
			header: "Status",
			cell: ({ row }) => (
				<Badge
					variant={getPaymentStatusVariant(
						row.original.stoppedAccount,
						row.original.debtAccount,
					)}
					className="text-xs"
				>
					{getPaymentStatusLabel(
						row.original.stoppedAccount,
						row.original.debtAccount,
					)}
				</Badge>
			),
		},
		{
			accessorKey: "billingMonth",
			header: "Month",
			cell: ({ row }) => (
				<span className="text-muted-foreground">
					{row.original.billingMonth
						? formatCycleShort(
								row.original.billingMonth.year,
								row.original.billingMonth.month,
							)
						: "\u2014"}
				</span>
			),
		},
		{
			accessorKey: "paidAt",
			header: "Paid",
			cell: ({ row }) => (
				<span className="text-muted-foreground">
					{formatDate(row.original.paidAt)}
				</span>
			),
		},
		{
			accessorKey: "notes",
			header: "Note",
			cell: ({ row }) => {
				const category = row.original.noteCategory;
				const notes = row.original.notes;
				if (!category && !notes) {
					return (
						<span className="text-muted-foreground">
							{"\u2014"}
						</span>
					);
				}
				return (
					<div className="max-w-[200px]">
						{category && (
							<Badge
								variant="outline"
								className="text-xs font-normal"
							>
								{NOTE_CATEGORY_LABELS[category] ?? category}
							</Badge>
						)}
						{notes && (
							<span className="block truncate text-xs text-muted-foreground mt-0.5">
								{notes}
							</span>
						)}
					</div>
				);
			},
		},
		{
			id: "actions",
			header: "",
			meta: { className: "w-20" },
			cell: ({ row }) => (
				<div className="flex items-center gap-0.5">
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
							<DropdownMenuItem asChild>
								<a
									href={`/invoice/${row.original.id}`}
									target="_blank"
									rel="noopener noreferrer"
								>
									<ReceiptTextIcon className="mr-2 size-4" />
									View Invoice
								</a>
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								className="text-destructive focus:text-destructive"
								onClick={() =>
									actions.onDelete(row.original.id)
								}
							>
								<TrashIcon className="mr-2 size-4" />
								Delete Payment
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			),
		},
	];
}

const PAYMENTS_PER_PAGE = 25;

export function PaymentsTable({
	payments,
	total,
	page,
	onPageChange,
	isLoading,
	isFetching,
	collectorName,
}: {
	payments: Payment[];
	total: number;
	page: number;
	onPageChange: (page: number) => void;
	isLoading: boolean;
	isFetching: boolean;
	collectorName: string;
}) {
	const organizationId = useOrganizationId();
	const deletePayment = useDeletePayment();

	const columns = useMemo(
		() =>
			getPaymentColumns({
				onDelete: (paymentId) => {
					if (!organizationId) {
						return;
					}
					toast.promise(
						deletePayment.mutateAsync({
							organizationId,
							paymentId,
						}),
						{
							loading: "Deleting payment...",
							success: "Payment deleted",
							error: (err: { message?: string }) =>
								err?.message ?? "Failed to delete payment",
						},
					);
				},
			}),
		[organizationId, deletePayment],
	);

	return (
		<div>
			<DataTable
				columns={columns}
				data={payments}
				isLoading={isLoading}
				isFetching={isFetching}
				pagination={{
					totalItems: total,
					currentPage: page,
					itemsPerPage: PAYMENTS_PER_PAGE,
					onPageChange,
				}}
				emptyState={
					<Card>
						<CardContent className="flex flex-col items-center gap-2 py-12 text-center">
							<ReceiptTextIcon className="size-10 text-muted-foreground/30" />
							<p className="text-sm text-muted-foreground">
								No payments found for {collectorName}.
							</p>
						</CardContent>
					</Card>
				}
			/>
		</div>
	);
}
