"use client";

import { Pagination } from "@saas/shared/components/Pagination";
import { EmptyState } from "@shared/components/EmptyState";
import { PageShell } from "@shared/components/PageShell";
import { SearchInput } from "@shared/components/SearchInput";
import { displayName } from "@shared/lib/display-name";
import { useOrganizationId } from "@shared/lib/organization";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Skeleton } from "@ui/components/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/components/table";
import { CheckIcon, ListIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { usePayments, useProcessPayment } from "../hooks/use-billing";

const STATUS_VARIANT: Record<
	string,
	"default" | "secondary" | "destructive" | "outline"
> = {
	PROCESSED: "default",
	PENDING: "secondary",
	PARTIAL: "outline",
	STOPPED: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
	PENDING: "Pending",
	PROCESSED: "Processed",
	PARTIAL: "Partial",
	STOPPED: "Stopped",
};

export function PaymentsList() {
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 300 });
	const [statusFilter, setStatusFilter] = useState<
		"PENDING" | "PROCESSED" | "PARTIAL" | "STOPPED" | undefined
	>();
	const [page, setPage] = useState(1);

	const { payments, total, totalPages } = usePayments({
		search: debouncedSearch || undefined,
		status: statusFilter,
		page,
	});

	const organizationId = useOrganizationId();
	const processPayment = useProcessPayment();

	return (
		<PageShell title="Payments" description={`${total} payment records`}>
			<div className="space-y-4">
				<div className="flex flex-wrap items-center gap-3">
					<SearchInput
						value={search}
						onChange={setSearch}
						placeholder="Search by customer..."
						className="max-w-xs"
					/>
					<div className="flex gap-1">
						{(
							[
								"all",
								"PENDING",
								"PROCESSED",
								"PARTIAL",
								"STOPPED",
							] as const
						).map((s) => (
							<Button
								key={s}
								size="sm"
								variant={
									(statusFilter ?? "all") === s
										? "secondary"
										: "outline"
								}
								onClick={() =>
									setStatusFilter(s === "all" ? undefined : s)
								}
							>
								{s === "all" ? "All" : (STATUS_LABEL[s] ?? s)}
							</Button>
						))}
					</div>
				</div>

				{payments.length === 0 ? (
					<EmptyState
						icon={ListIcon}
						title="No payments"
						description="No payment records match your filters."
					/>
				) : (
					<div className="rounded-xl border bg-card">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Customer</TableHead>
									<TableHead>Collector</TableHead>
									<TableHead>Date</TableHead>
									<TableHead className="text-right">
										Amount
									</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Note</TableHead>
									<TableHead />
								</TableRow>
							</TableHeader>
							<TableBody>
								{payments.map((payment) => (
									<TableRow key={payment.id}>
										<TableCell>
											<div className="font-medium">
												{displayName(
													payment.customer.firstName,
													payment.customer.lastName,
												)}
											</div>
											<div className="text-xs text-muted-foreground">
												{payment.customer.username}
											</div>
										</TableCell>
										<TableCell className="text-sm">
											{payment.collector.name}
										</TableCell>
										<TableCell className="text-sm">
											{new Date(
												payment.paidAt,
											).toLocaleDateString()}
										</TableCell>
										<TableCell className="text-right font-semibold tabular-nums">
											${payment.paidAmount.toFixed(2)}
										</TableCell>
										<TableCell>
											<Badge
												variant={
													STATUS_VARIANT[
														payment.status
													] ?? "secondary"
												}
											>
												{STATUS_LABEL[payment.status] ??
													payment.status}
											</Badge>
										</TableCell>
										<TableCell className="max-w-32 truncate text-xs text-muted-foreground">
											{payment.noteCategory ??
												payment.notes ??
												"—"}
										</TableCell>
										<TableCell>
											{payment.status !== "PROCESSED" &&
												organizationId && (
													<Button
														size="sm"
														variant="ghost"
														disabled={
															processPayment.isPending
														}
														onClick={() =>
															processPayment.mutate(
																{
																	organizationId,
																	paymentId:
																		payment.id,
																},
																{
																	onSuccess:
																		() =>
																			toast.success(
																				"Payment processed",
																			),
																	onError: (
																		error,
																	) =>
																		toast.error(
																			error.message,
																		),
																},
															)
														}
													>
														<CheckIcon className="size-3.5" />
													</Button>
												)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				)}

				{totalPages > 1 && (
					<Pagination
						totalItems={total}
						itemsPerPage={25}
						currentPage={page}
						onChangeCurrentPage={setPage}
					/>
				)}
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
