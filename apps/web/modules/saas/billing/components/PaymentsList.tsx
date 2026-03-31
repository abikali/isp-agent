"use client";

import { EmptyState } from "@shared/components/EmptyState";
import { PageShell } from "@shared/components/PageShell";
import { SearchInput } from "@shared/components/SearchInput";
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
	AlertDialogTrigger,
} from "@ui/components/alert-dialog";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { DataTable } from "@ui/components/data-table";
import { Skeleton } from "@ui/components/skeleton";
import { ListIcon, RotateCcwIcon, TrashIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
	useCollectors,
	useCustomerGroups,
	useDeletePayment,
	useMonthFilter,
	usePaymentsQuery,
} from "../hooks/use-billing";
import {
	getPaymentStatusLabel,
	getPaymentStatusVariant,
	NOTE_CATEGORY_LABELS,
} from "../lib/billing-utils";
import { BillingCycleSelect } from "./BillingCycleSelect";
import { CollectorSelect, GroupSelect } from "./BillingFilters";

const PAGE_SIZE = 25;

interface PaymentRow {
	id: string;
	customer: {
		firstName: string | null;
		lastName: string | null;
		username: string | null;
	};
	collector: { id: string; name: string };
	paidAt: string | Date;
	paidAmount: number;
	stoppedAccount: boolean;
	noteCategory: string | null;
	notes: string | null;
}

export function PaymentsList() {
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 300 });
	const [stoppedFilter, setStoppedFilter] = useState<boolean | undefined>();
	const [collectorFilter, setCollectorFilter] = useState<
		string | undefined
	>();
	const [groupFilter, setGroupFilter] = useState<string | undefined>();
	const [page, setPage] = useState(1);
	const {
		monthFilter,
		setMonthFilter,
		activeMonthId,
		options: monthOptions,
	} = useMonthFilter();

	// Reset page when filters change
	const handleStoppedChange = (s: boolean | undefined) => {
		setStoppedFilter(s);
		setPage(1);
	};
	const handleCollectorChange = (value: string) => {
		setCollectorFilter(value || undefined);
		setPage(1);
	};
	const handleGroupChange = (value: string) => {
		setGroupFilter(value || undefined);
		setPage(1);
	};
	const handleMonthChange = (value: string) => {
		setMonthFilter(value);
		setPage(1);
	};

	const { payments, total, isLoading, isFetching } = usePaymentsQuery({
		search: debouncedSearch || undefined,
		stoppedAccount: stoppedFilter,
		collectorId: collectorFilter,
		groupName: groupFilter,
		billingMonthId: activeMonthId,
		page,
		pageSize: PAGE_SIZE,
	});

	const { data: collectorsData } = useCollectors();
	const { groups } = useCustomerGroups();
	const collectors = collectorsData?.collectors ?? [];

	const organizationId = useOrganizationId();
	const deletePayment = useDeletePayment();

	const hasActiveFilters =
		stoppedFilter !== undefined ||
		!!collectorFilter ||
		!!groupFilter ||
		(!!monthFilter && monthFilter !== "all") ||
		!!search;

	const resetFilters = () => {
		setSearch("");
		setStoppedFilter(undefined);
		setCollectorFilter(undefined);
		setGroupFilter(undefined);
		setMonthFilter("");
		setPage(1);
	};

	const columns = useMemo<ColumnDef<PaymentRow, unknown>[]>(
		() => [
			{
				id: "invoice",
				header: "Invoice",
				enableSorting: false,
				meta: { className: "w-28" },
				cell: ({ row }) => (
					<a
						href={`/invoice/${row.original.id}`}
						target="_blank"
						rel="noopener noreferrer"
						className="font-mono text-xs text-blue-600 hover:underline"
					>
						#{row.original.id.slice(-8).toUpperCase()}
					</a>
				),
			},
			{
				id: "customer",
				header: "Customer",
				enableSorting: false,
				cell: ({ row }) => (
					<>
						<div className="font-medium">
							{displayName(
								row.original.customer.firstName,
								row.original.customer.lastName,
							)}
						</div>
						<div className="text-xs text-muted-foreground">
							{row.original.customer.username}
						</div>
					</>
				),
			},
			{
				id: "collector",
				header: "Collector",
				enableSorting: false,
				meta: { className: "hidden sm:table-cell" },
				cell: ({ row }) => (
					<span className="text-sm">
						{row.original.collector.name}
					</span>
				),
			},
			{
				id: "date",
				header: "Date",
				enableSorting: false,
				meta: { className: "hidden md:table-cell" },
				cell: ({ row }) => (
					<span className="text-sm">
						{new Date(row.original.paidAt).toLocaleDateString()}
					</span>
				),
			},
			{
				id: "amount",
				header: "Amount",
				enableSorting: false,
				meta: { className: "text-right" },
				cell: ({ row }) => (
					<span className="font-semibold tabular-nums">
						{formatCurrency(row.original.paidAmount)}
					</span>
				),
			},
			{
				id: "status",
				header: "Status",
				enableSorting: false,
				cell: ({ row }) => (
					<Badge
						variant={getPaymentStatusVariant(
							row.original.stoppedAccount,
						)}
					>
						{getPaymentStatusLabel(row.original.stoppedAccount)}
					</Badge>
				),
			},
			{
				id: "note",
				header: "Note",
				enableSorting: false,
				meta: {
					className: "hidden lg:table-cell max-w-40",
				},
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
						<div>
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
				enableSorting: false,
				cell: ({ row }) => (
					<div className="flex items-center gap-1">
						{organizationId && (
							<AlertDialog>
								<AlertDialogTrigger asChild>
									<Button
										size="sm"
										variant="ghost"
										className="text-destructive"
									>
										<TrashIcon className="size-3.5" />
									</Button>
								</AlertDialogTrigger>
								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>
											Delete payment?
										</AlertDialogTitle>
										<AlertDialogDescription>
											This will permanently delete this
											payment of{" "}
											{formatCurrency(
												row.original.paidAmount,
											)}{" "}
											and reset the customer&apos;s paid
											status.
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel>
											Cancel
										</AlertDialogCancel>
										<AlertDialogAction
											onClick={() =>
												deletePayment.mutate(
													{
														organizationId,
														paymentId:
															row.original.id,
													},
													{
														onSuccess: () =>
															toast.success(
																"Payment deleted",
															),
														onError: (error) =>
															toast.error(
																error.message,
															),
													},
												)
											}
										>
											Delete
										</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						)}
					</div>
				),
			},
		],
		[organizationId, deletePayment],
	);

	return (
		<PageShell
			title="Payments"
			description={isLoading ? "Loading..." : `${total} payment records`}
		>
			<div className="space-y-4">
				{/* Search + Filters */}
				<div className="flex flex-wrap items-center gap-3">
					<SearchInput
						value={search}
						onChange={(v) => {
							setSearch(v);
							setPage(1);
						}}
						placeholder="Search by customer or invoice..."
						className="max-w-xs"
					/>

					<CollectorSelect
						value={collectorFilter ?? ""}
						onChange={handleCollectorChange}
						collectors={collectors}
					/>

					<GroupSelect
						value={groupFilter ?? ""}
						onChange={handleGroupChange}
						groups={groups}
					/>

					<BillingCycleSelect
						value={monthFilter || activeMonthId || "all"}
						onValueChange={handleMonthChange}
						options={monthOptions}
						allLabel="All Months"
					/>

					{hasActiveFilters && (
						<Button
							variant="ghost"
							size="sm"
							onClick={resetFilters}
						>
							<RotateCcwIcon className="mr-1 size-3.5" />
							Reset
						</Button>
					)}
				</div>

				{/* Status Buttons */}
				<div className="flex flex-wrap gap-1">
					{(
						[
							{ key: "all", label: "All", value: undefined },
							{
								key: "collected",
								label: "Collected",
								value: false,
							},
							{
								key: "stopped",
								label: "Stopped",
								value: true,
							},
						] as const
					).map((s) => (
						<Button
							key={s.key}
							size="sm"
							variant={
								stoppedFilter === s.value
									? "secondary"
									: "outline"
							}
							onClick={() => handleStoppedChange(s.value)}
						>
							{s.label}
						</Button>
					))}
				</div>

				<DataTable
					columns={columns}
					data={payments}
					isLoading={isLoading}
					isFetching={isFetching}
					pagination={{
						totalItems: total,
						currentPage: page,
						itemsPerPage: PAGE_SIZE,
						onPageChange: setPage,
					}}
					emptyState={
						<EmptyState
							icon={ListIcon}
							title="No payments"
							description="No payment records match your filters."
						/>
					}
				/>
			</div>
		</PageShell>
	);
}

export function PaymentsListSkeleton() {
	return (
		<PageShell title="Payments" description="Loading...">
			<div className="space-y-4">
				<Skeleton className="h-10 w-full" />
				<div className="rounded-xl border bg-card p-4">
					{Array.from({ length: 5 }).map((_, i) => (
						<div key={i} className="flex items-center gap-4 py-3">
							<Skeleton className="h-5 w-32" />
							<Skeleton className="h-5 w-20" />
							<Skeleton className="h-5 w-16" />
							<Skeleton className="ml-auto h-5 w-16" />
						</div>
					))}
				</div>
			</div>
		</PageShell>
	);
}
