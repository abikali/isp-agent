"use client";

import { useActiveOrganization } from "@saas/organizations/client";
import { SearchInput } from "@shared/components/SearchInput";
import { formatCurrency } from "@shared/lib/format";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { Button } from "@ui/components/button";
import { Card, CardContent } from "@ui/components/card";
import { Skeleton } from "@ui/components/skeleton";
import {
	CheckCircleIcon,
	GiftIcon,
	Loader2Icon,
	ReceiptTextIcon,
	XCircleIcon,
} from "lucide-react";
import { useState } from "react";
import { usePaymentsQuery } from "../hooks/use-billing";
import { formatCycleLong } from "../lib/billing-utils";

const PAGE_SIZE = 50;

export function CollectorPayments() {
	const { employee } = useActiveOrganization();
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 300 });
	const [page, setPage] = useState(1);

	const { payments, total, totalPages, isLoading, isFetching, error } =
		usePaymentsQuery({
			collectorId: employee?.id,
			search: debouncedSearch || undefined,
			page,
			pageSize: PAGE_SIZE,
		});

	// Group payments by billing month
	const grouped = groupByMonth(payments);

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

			{/* Loading */}
			{isLoading ? (
				<div className="space-y-3">
					{Array.from({ length: 5 }).map((_, i) => (
						<Skeleton key={i} className="h-16 w-full rounded-lg" />
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
				<>
					{/* Summary bar */}
					<div className="flex items-baseline justify-between">
						<p className="text-sm text-muted-foreground">
							{total} {total === 1 ? "payment" : "payments"}
						</p>
					</div>

					{/* Grouped list */}
					<div className="space-y-5">
						{grouped.map((group) => (
							<section key={group.key}>
								{/* Month header */}
								<div className="sticky top-[89px] z-10 -mx-4 mb-2 border-b bg-muted/80 px-4 py-2 backdrop-blur-sm">
									<div className="flex items-baseline justify-between">
										<h3 className="text-sm font-semibold">
											{group.label}
										</h3>
										<span className="text-xs text-muted-foreground">
											{group.payments.length}{" "}
											{group.payments.length === 1
												? "bill"
												: "bills"}{" "}
											&middot;{" "}
											{formatCurrency(group.total)}
										</span>
									</div>
								</div>

								{/* Payment rows */}
								<div className="space-y-1.5">
									{group.payments.map((payment) => (
										<PaymentRow
											key={payment.id}
											payment={payment}
										/>
									))}
								</div>
							</section>
						))}
					</div>

					{/* Pagination */}
					{totalPages > 1 && (
						<div className="flex flex-col items-center gap-2 pt-2">
							<div className="flex items-center gap-3 w-full">
								<Button
									variant="outline"
									size="lg"
									disabled={page <= 1 || isFetching}
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
									disabled={page >= totalPages || isFetching}
									onClick={() => setPage((p) => p + 1)}
									className="flex-1 max-w-[150px]"
								>
									{isFetching ? (
										<Loader2Icon className="size-4 animate-spin" />
									) : (
										"Next"
									)}
								</Button>
							</div>
						</div>
					)}
				</>
			)}
		</div>
	);
}

// ── Payment Row ─────────────────────────────────────────────────

interface PaymentRowProps {
	payment: {
		id: string;
		paidAmount: number;
		paidAt: string | Date;
		freeAccount: boolean;
		stoppedAccount: boolean;
		customer?: {
			firstName?: string | null;
			lastName?: string | null;
			username?: string | null;
		} | null;
	};
}

function PaymentRow({ payment }: PaymentRowProps) {
	const name =
		[payment.customer?.firstName, payment.customer?.lastName]
			.filter(Boolean)
			.join(" ") ||
		payment.customer?.username ||
		"Unknown";

	const date = new Date(payment.paidAt);
	const isStopped = payment.stoppedAccount;
	const isFree = payment.freeAccount;

	return (
		<div className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2.5">
			{/* Status icon */}
			{isStopped ? (
				<div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-destructive/10">
					<XCircleIcon className="size-4 text-destructive" />
				</div>
			) : isFree ? (
				<div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-500/10">
					<GiftIcon className="size-4 text-blue-500" />
				</div>
			) : (
				<div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-success/10">
					<CheckCircleIcon className="size-4 text-success" />
				</div>
			)}

			{/* Details */}
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-medium">{name}</p>
				<p className="text-[11px] text-muted-foreground">
					{date.toLocaleDateString("en-US", {
						day: "numeric",
						month: "short",
					})}
					{isStopped && (
						<span className="ml-1.5 rounded bg-destructive/10 px-1 py-0.5 text-[10px] font-medium text-destructive">
							Stopped
						</span>
					)}
					{isFree && (
						<span className="ml-1.5 rounded bg-blue-500/10 px-1 py-0.5 text-[10px] font-medium text-blue-600">
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
}

// ── Grouping Helper ──────────────────────────────────────────────

interface GroupedMonth {
	key: string;
	label: string;
	total: number;
	payments: PaymentRowProps["payment"][];
}

function groupByMonth(
	payments: PaymentRowProps["payment"][] &
		{ billingMonth?: { year: number; month: number } | null }[],
): GroupedMonth[] {
	const map = new Map<string, GroupedMonth>();

	for (const payment of payments) {
		const bm = (
			payment as { billingMonth?: { year: number; month: number } | null }
		).billingMonth;
		const year = bm?.year ?? new Date(payment.paidAt).getFullYear();
		const month = bm?.month ?? new Date(payment.paidAt).getMonth() + 1;
		const key = `${year}-${String(month).padStart(2, "0")}`;

		let group = map.get(key);
		if (!group) {
			group = {
				key,
				label: formatCycleLong(year, month),
				total: 0,
				payments: [],
			};
			map.set(key, group);
		}
		group.total += payment.paidAmount;
		group.payments.push(payment);
	}

	// Sort newest month first
	return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
}

// ── Skeleton ────────────────────────────────────────────────────

export function CollectorPaymentsSkeleton() {
	return (
		<div className="space-y-4">
			<Skeleton className="h-10 w-full" />
			<Skeleton className="h-5 w-24" />
			<Skeleton className="h-8 w-full" />
			{Array.from({ length: 5 }).map((_, i) => (
				<Skeleton key={i} className="h-14 w-full rounded-lg" />
			))}
		</div>
	);
}
