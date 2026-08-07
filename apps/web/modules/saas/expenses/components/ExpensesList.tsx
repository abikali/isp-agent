"use client";

import { useEmployeesQuery } from "@saas/employees/client";
import { Pagination } from "@saas/shared/components/Pagination";
import {
	ContentCard,
	ContentCardToolbar,
} from "@shared/components/ContentCard";
import { EmptyState } from "@shared/components/EmptyState";
import { ImageViewerDialog } from "@shared/components/ImageViewerDialog";
import { PageShell } from "@shared/components/PageShell";
import { PermissionGate } from "@shared/components/PermissionGate";
import { formatCurrency, formatDate, formatDateTime } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { DataTable } from "@ui/components/data-table";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { Tabs, TabsList, TabsTrigger } from "@ui/components/tabs";
import { Textarea } from "@ui/components/textarea";
import { CheckIcon, ImageIcon, ReceiptIcon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
	type ExpenseStatus,
	useApproveExpense,
	useExpenses,
	useRejectExpense,
} from "../hooks/use-expenses";

type Expense = ReturnType<typeof useExpenses>["expenses"][number];

const STATUS_BADGES: Record<
	ExpenseStatus,
	{ label: string; variant: "info" | "success" | "error" }
> = {
	PENDING: { label: "Pending", variant: "info" },
	APPROVED: { label: "Approved", variant: "success" },
	REJECTED: { label: "Rejected", variant: "error" },
};

// react-doctor-disable-next-line react-doctor/no-giant-component -- cohesive expenses review page: filters, approval/reject dialog, and table column defs share local state; splitting would scatter tightly-coupled state
// react-doctor-disable-next-line react-doctor/prefer-useReducer -- independent filter/dialog state slices (status, employee, month, page, ...) read clearer as separate useState than a reducer
export function ExpensesList() {
	const organizationId = useOrganizationId();
	const [status, setStatus] = useState<ExpenseStatus>("PENDING");
	const [employeeId, setEmployeeId] = useState<string | undefined>();
	const [monthFilter, setMonthFilter] = useState<string>("all");
	const [page, setPage] = useState(1);

	// monthFilter format: "YYYY-M"
	const monthRange = (() => {
		if (monthFilter === "all") {
			return {};
		}
		const [year, month] = monthFilter.split("-").map(Number);
		const from = new Date(year as number, (month as number) - 1, 1);
		const to = new Date(year as number, month as number, 1);
		return { from, to };
	})();

	const monthOptions = (() => {
		const options: Array<{ value: string; label: string }> = [];
		const now = new Date();
		for (let i = 0; i < 24; i++) {
			const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
			options.push({
				value: `${d.getFullYear()}-${d.getMonth() + 1}`,
				label: formatDate(d, { month: "long", year: "numeric" }),
			});
		}
		return options;
	})();

	const { employees } = useEmployeesQuery();
	const { expenses, total, totalAmount, totalPages } = useExpenses({
		status,
		employeeId,
		...monthRange,
		page,
	});

	const approveExpense = useApproveExpense();
	const rejectExpense = useRejectExpense();

	const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
	const [rejecting, setRejecting] = useState<Expense | null>(null);
	const [rejectReason, setRejectReason] = useState("");

	const columns = useMemo<ColumnDef<Expense, unknown>[]>(
		() => [
			{
				accessorKey: "createdAt",
				header: "Date",
				cell: ({ row }) => (
					<span className="whitespace-nowrap text-sm tabular-nums">
						{formatDateTime(row.original.createdAt, {
							dateStyle: "medium",
							timeStyle: "short",
						})}
					</span>
				),
			},
			{
				id: "worker",
				header: "Worker",
				cell: ({ row }) => (
					<span className="text-sm font-medium">
						{row.original.submittedBy.name}
					</span>
				),
			},
			{
				accessorKey: "amount",
				header: "Amount",
				cell: ({ row }) => (
					<span className="font-mono text-sm font-medium tabular-nums">
						{formatCurrency(row.original.amount)}
					</span>
				),
			},
			{
				id: "description",
				header: "Description",
				enableSorting: false,
				cell: ({ row }) => (
					<div>
						{row.original.category && (
							<Badge variant="outline" className="mr-2">
								{row.original.category}
							</Badge>
						)}
						<span className="text-sm text-muted-foreground">
							{row.original.description}
						</span>
						{row.original.status === "REJECTED" &&
							row.original.rejectedReason && (
								<p className="mt-0.5 text-xs text-destructive">
									Reason: {row.original.rejectedReason}
								</p>
							)}
					</div>
				),
			},
			{
				id: "receipt",
				header: "Receipt",
				enableSorting: false,
				cell: ({ row }) =>
					row.original.receiptUrl ? (
						<Button
							variant="outline"
							size="sm"
							onClick={() =>
								setReceiptUrl(row.original.receiptUrl)
							}
						>
							<ImageIcon className="mr-1.5 size-3.5" />
							View
						</Button>
					) : (
						<span className="text-xs text-muted-foreground">
							No photo
						</span>
					),
			},
			{
				id: "status",
				header: "Status",
				enableSorting: false,
				meta: { className: "hidden sm:table-cell" },
				cell: ({ row }) => {
					const cfg =
						STATUS_BADGES[row.original.status as ExpenseStatus];
					return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
				},
			},
			{
				id: "actions",
				enableSorting: false,
				cell: ({ row }) => {
					const expense = row.original;
					if (expense.status !== "PENDING") {
						return expense.approvedBy ? (
							<span className="text-xs text-muted-foreground">
								by {expense.approvedBy.name}
							</span>
						) : null;
					}
					return (
						<PermissionGate resource="expenses" action="approve">
							<div className="flex gap-1.5">
								<Button
									size="sm"
									disabled={approveExpense.isPending}
									onClick={async () => {
										if (!organizationId) {
											return;
										}
										try {
											await approveExpense.mutateAsync({
												organizationId,
												id: expense.id,
											});
											toast.success("Expense approved");
										} catch (error) {
											toast.error(
												error instanceof Error
													? error.message
													: "Failed to approve",
											);
										}
									}}
								>
									<CheckIcon className="mr-1 size-3.5" />
									Approve
								</Button>
								<Button
									size="sm"
									variant="outline"
									onClick={() => {
										setRejectReason("");
										setRejecting(expense);
									}}
								>
									<XIcon className="mr-1 size-3.5" />
									Reject
								</Button>
							</div>
						</PermissionGate>
					);
				},
			},
		],
		[organizationId, approveExpense],
	);

	return (
		<PageShell
			title="Expenses"
			description="Review worker expense claims — approve to deduct from their cash balance."
		>
			<ContentCard>
				<ContentCardToolbar>
					<div className="flex flex-wrap items-center justify-between gap-2 w-full">
						<Tabs
							value={status}
							onValueChange={(v) => {
								setStatus(v as ExpenseStatus);
								setPage(1);
							}}
						>
							<TabsList>
								<TabsTrigger value="PENDING">
									Pending
									{status === "PENDING" && total > 0 && (
										<Badge
											variant="info"
											className="ml-1.5"
										>
											{formatCurrency(totalAmount)}
										</Badge>
									)}
								</TabsTrigger>
								<TabsTrigger value="APPROVED">
									Approved
								</TabsTrigger>
								<TabsTrigger value="REJECTED">
									Rejected
								</TabsTrigger>
							</TabsList>
						</Tabs>
						<div className="flex items-center gap-2">
							<Select
								value={monthFilter}
								onValueChange={(v) => {
									setMonthFilter(v);
									setPage(1);
								}}
							>
								<SelectTrigger className="w-44">
									<SelectValue placeholder="All time" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">
										All time
									</SelectItem>
									{monthOptions.map((opt) => (
										<SelectItem
											key={opt.value}
											value={opt.value}
										>
											{opt.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Select
								value={employeeId ?? "all"}
								onValueChange={(v) => {
									setEmployeeId(v === "all" ? undefined : v);
									setPage(1);
								}}
							>
								<SelectTrigger className="w-44">
									<SelectValue placeholder="All workers" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">
										All workers
									</SelectItem>
									{employees.map((emp) => (
										<SelectItem key={emp.id} value={emp.id}>
											{emp.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
				</ContentCardToolbar>

				<DataTable
					columns={columns}
					data={expenses}
					pageSize={25}
					emptyState={
						<EmptyState
							icon={ReceiptIcon}
							title={`No ${status.toLowerCase()} expenses`}
							description="Worker expense claims will appear here."
						/>
					}
				/>

				{totalPages > 1 && (
					<div className="border-t px-4 py-3">
						<Pagination
							currentPage={page}
							totalItems={total}
							itemsPerPage={25}
							onChangeCurrentPage={setPage}
						/>
					</div>
				)}
			</ContentCard>

			{receiptUrl && (
				<ImageViewerDialog
					open={!!receiptUrl}
					onOpenChange={(open) => {
						if (!open) {
							setReceiptUrl(null);
						}
					}}
					src={receiptUrl}
					title="Receipt"
				/>
			)}

			{rejecting && (
				<Dialog
					open={!!rejecting}
					onOpenChange={(open) => {
						if (!open) {
							setRejecting(null);
						}
					}}
				>
					<DialogContent className="sm:max-w-sm">
						<DialogHeader>
							<DialogTitle>Reject Expense</DialogTitle>
						</DialogHeader>
						<p className="text-sm text-muted-foreground">
							Rejecting {rejecting.submittedBy.name}'s{" "}
							{formatCurrency(rejecting.amount)} expense.
						</p>
						<Textarea
							value={rejectReason}
							onChange={(e) => setRejectReason(e.target.value)}
							placeholder="Reason (optional)"
							rows={3}
						/>
						<DialogFooter>
							<Button
								variant="outline"
								onClick={() => setRejecting(null)}
							>
								Cancel
							</Button>
							<Button
								variant="destructive"
								disabled={rejectExpense.isPending}
								onClick={async () => {
									if (!organizationId) {
										return;
									}
									try {
										await rejectExpense.mutateAsync({
											organizationId,
											id: rejecting.id,
											reason: rejectReason || undefined,
										});
										toast.success("Expense rejected");
										setRejecting(null);
									} catch (error) {
										toast.error(
											error instanceof Error
												? error.message
												: "Failed to reject",
										);
									}
								}}
							>
								Reject
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			)}
		</PageShell>
	);
}
