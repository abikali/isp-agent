"use client";

import { useActiveOrganization } from "@saas/organizations/client";
import { SearchInput } from "@shared/components/SearchInput";
import { formatCurrency } from "@shared/lib/format";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { Button } from "@ui/components/button";
import { Card, CardContent } from "@ui/components/card";
import { Skeleton } from "@ui/components/skeleton";
import { CheckCircleIcon, ReceiptTextIcon, XCircleIcon } from "lucide-react";
import { useState } from "react";
import { usePaymentsQuery } from "../hooks/use-billing";

export function CollectorPayments() {
	const { employee } = useActiveOrganization();
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 300 });
	const [page, setPage] = useState(1);

	const { payments, total, totalPages, isLoading, error } = usePaymentsQuery({
		collectorId: employee?.id,
		search: debouncedSearch || undefined,
		page,
		pageSize: 30,
	});

	return (
		<div className="space-y-4 pb-8">
			{/* Search */}
			<SearchInput
				value={search}
				onChange={(val) => {
					setSearch(val);
					setPage(1);
				}}
				placeholder="Search by name..."
			/>

			{/* Error */}
			{error && (
				<Card>
					<CardContent className="py-6 text-center text-sm text-destructive">
						Failed to load payments:{" "}
						{error.message || "Unknown error"}
					</CardContent>
				</Card>
			)}

			{/* Count */}
			<p className="text-sm text-muted-foreground">
				{total} {total === 1 ? "payment" : "payments"}
			</p>

			{/* Payment list */}
			{isLoading ? (
				<div className="space-y-3">
					{Array.from({ length: 5 }).map((_, i) => (
						<Skeleton key={i} className="h-20 w-full rounded-lg" />
					))}
				</div>
			) : payments.length === 0 ? (
				<Card>
					<CardContent className="flex flex-col items-center gap-2 py-12">
						<ReceiptTextIcon className="size-10 text-muted-foreground/40" />
						<p className="text-lg font-medium">No payments yet</p>
						<p className="text-sm text-muted-foreground">
							Payments you collect will appear here.
						</p>
					</CardContent>
				</Card>
			) : (
				<div className="space-y-2">
					{payments.map((payment) => {
						const name =
							[
								payment.customer?.firstName,
								payment.customer?.lastName,
							]
								.filter(Boolean)
								.join(" ") ||
							payment.customer?.username ||
							"Unknown";
						const date = new Date(payment.paidAt);
						const isStopped = payment.stoppedAccount;
						const isFree = payment.freeAccount;

						return (
							<div
								key={payment.id}
								className="flex items-center gap-3 rounded-lg border bg-background p-3"
							>
								{/* Status icon */}
								<div
									className={
										isStopped
											? "flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10"
											: "flex size-9 shrink-0 items-center justify-center rounded-full bg-success/10"
									}
								>
									{isStopped ? (
										<XCircleIcon className="size-4 text-destructive" />
									) : (
										<CheckCircleIcon className="size-4 text-success" />
									)}
								</div>

								{/* Details */}
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm font-medium">
										{name}
									</p>
									<p className="text-xs text-muted-foreground">
										{date.toLocaleDateString("en-US", {
											day: "numeric",
											month: "short",
											year: "numeric",
										})}
										{isStopped && (
											<span className="ml-1.5 text-destructive font-medium">
												Stopped
											</span>
										)}
										{isFree && (
											<span className="ml-1.5 text-blue-600 font-medium">
												Free
											</span>
										)}
									</p>
								</div>

								{/* Amount */}
								<p className="shrink-0 text-sm font-bold tabular-nums">
									{formatCurrency(payment.paidAmount)}
								</p>
							</div>
						);
					})}
				</div>
			)}

			{/* Pagination */}
			{totalPages > 1 && (
				<div className="flex items-center justify-center gap-3">
					<Button
						variant="outline"
						size="lg"
						disabled={page <= 1}
						onClick={() => setPage((p) => p - 1)}
						className="flex-1 max-w-[150px]"
					>
						Previous
					</Button>
					<span className="text-sm text-muted-foreground tabular-nums">
						{page}/{totalPages}
					</span>
					<Button
						variant="outline"
						size="lg"
						disabled={page >= totalPages}
						onClick={() => setPage((p) => p + 1)}
						className="flex-1 max-w-[150px]"
					>
						Next
					</Button>
				</div>
			)}
		</div>
	);
}

export function CollectorPaymentsSkeleton() {
	return (
		<div className="space-y-4">
			<Skeleton className="h-10 w-full" />
			<Skeleton className="h-5 w-24" />
			{Array.from({ length: 5 }).map((_, i) => (
				<Skeleton key={i} className="h-20 w-full rounded-lg" />
			))}
		</div>
	);
}
