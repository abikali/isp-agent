"use client";

import { useActiveOrganization } from "@saas/organizations/client";
import { formatCurrency } from "@shared/lib/format";
import { Link } from "@tanstack/react-router";
import { Badge } from "@ui/components/badge";
import { Card, CardContent } from "@ui/components/card";
import { Skeleton } from "@ui/components/skeleton";
import {
	PackageIcon,
	ReceiptIcon,
	UserPlusIcon,
	WalletIcon,
} from "lucide-react";
import {
	useMyCustomerItemsQuery,
	useMyCustomersQuery,
	useMyStatsQuery,
	useMyWalletQuery,
} from "../hooks/use-worker";

const STATUS_VARIANTS: Record<string, "success" | "info" | "outline"> = {
	ACTIVE: "success",
	PENDING: "info",
};

export function WorkerHome() {
	const { activeOrganization } = useActiveOrganization();
	const { wallet, isLoading: walletLoading } = useMyWalletQuery();
	const { stats, isLoading: statsLoading } = useMyStatsQuery();
	const { customers } = useMyCustomersQuery();
	const { byCustomer } = useMyCustomerItemsQuery();

	const orgSlug = activeOrganization?.slug ?? "";

	const visibleCustomers = [...customers]
		.sort((a, b) =>
			a.status === "PENDING" ? -1 : b.status === "PENDING" ? 1 : 0,
		)
		.slice(0, 10);

	return (
		<div className="space-y-4">
			{/* Wallet */}
			<Card>
				<CardContent className="p-5">
					<div className="flex items-center gap-2 text-muted-foreground">
						<WalletIcon className="size-4" />
						<span className="text-sm">Cash balance</span>
					</div>
					{walletLoading ? (
						<Skeleton className="mt-2 h-9 w-32" />
					) : (
						<p className="mt-1 font-semibold text-3xl tabular-nums">
							{formatCurrency(wallet?.balance ?? 0)}
						</p>
					)}
					{wallet && (
						<div className="mt-3 grid grid-cols-2 gap-2 text-muted-foreground text-xs">
							<div>
								<p>Pending expenses</p>
								<p className="font-medium text-foreground tabular-nums">
									{formatCurrency(
										wallet.pendingExpensesAmount,
									)}{" "}
									({wallet.pendingExpensesCount})
								</p>
							</div>
							<div>
								<p>Approved expenses</p>
								<p className="font-medium text-foreground tabular-nums">
									{formatCurrency(
										wallet.approvedExpensesAmount,
									)}{" "}
									({wallet.approvedExpensesCount})
								</p>
							</div>
						</div>
					)}
				</CardContent>
			</Card>

			{/* This month — new users + items installed */}
			<div className="grid grid-cols-2 gap-3">
				<Card>
					<CardContent className="p-4 text-center">
						<UserPlusIcon className="mx-auto size-5 text-muted-foreground" />
						{statsLoading ? (
							<Skeleton className="mx-auto mt-1 h-7 w-10" />
						) : (
							<p className="mt-1 font-semibold text-xl tabular-nums">
								{stats?.customers.createdThisMonth ?? 0}
							</p>
						)}
						<p className="text-muted-foreground text-xs">
							New users (this month)
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="p-4 text-center">
						<PackageIcon className="mx-auto size-5 text-muted-foreground" />
						{statsLoading ? (
							<Skeleton className="mx-auto mt-1 h-7 w-10" />
						) : (
							<p className="mt-1 font-semibold text-xl tabular-nums">
								{stats?.installations.itemsThisMonth ?? 0}
							</p>
						)}
						<p className="text-muted-foreground text-xs">
							Items installed (this month)
						</p>
					</CardContent>
				</Card>
			</div>

			{/* Quick actions */}
			<div className="grid grid-cols-2 gap-3">
				<Link
					to="/work/$organizationSlug/new-customer"
					params={{ organizationSlug: orgSlug }}
					className="flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 font-medium text-primary-foreground text-sm"
				>
					<UserPlusIcon className="size-4" />
					New customer
				</Link>
				<Link
					to="/work/$organizationSlug/expenses"
					params={{ organizationSlug: orgSlug }}
					className="flex items-center justify-center gap-2 rounded-md border bg-background px-4 py-3 font-medium text-sm"
				>
					<ReceiptIcon className="size-4" />
					Submit expense
				</Link>
			</div>

			{/* My customers — items installed + total to collect (worker.php parity) */}
			{customers.length > 0 && (
				<Card>
					<CardContent className="p-4">
						<div className="mb-3 flex items-center justify-between">
							<p className="font-medium text-sm">My customers</p>
							<span className="text-muted-foreground text-xs tabular-nums">
								{customers.length}
							</span>
						</div>
						<div className="grid gap-2 sm:grid-cols-2">
							{visibleCustomers.map((customer) => {
								const name =
									[customer.firstName, customer.lastName]
										.filter(Boolean)
										.join(" ") || customer.accountNumber;
								const entry = byCustomer[customer.id];
								const items = entry?.items ?? [];
								const toCollect =
									(customer.monthlyRate ?? 0) +
									(entry?.equipmentTotal ?? 0);
								return (
									<div
										key={customer.id}
										className="flex flex-col gap-2 rounded-lg border p-3"
									>
										<div className="flex items-start justify-between gap-2">
											<div className="min-w-0">
												<p className="truncate font-medium text-sm">
													{name}
												</p>
												{customer.groupName && (
													<p className="truncate text-muted-foreground text-xs">
														{customer.groupName}
													</p>
												)}
											</div>
											<Badge
												variant={
													STATUS_VARIANTS[
														customer.status
													] ?? "outline"
												}
											>
												{customer.status.toLowerCase()}
											</Badge>
										</div>
										<div className="flex items-end justify-between gap-2">
											<div className="min-w-0">
												<p className="text-[11px] text-muted-foreground">
													Total to collect
												</p>
												<p className="font-mono font-semibold text-base tabular-nums">
													{formatCurrency(toCollect)}
												</p>
											</div>
											{customer.monthlyRate != null && (
												<span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
													{formatCurrency(
														customer.monthlyRate,
													)}
													/mo
												</span>
											)}
										</div>
										{items.length > 0 && (
											<div className="flex flex-wrap gap-1 border-t pt-2">
												{items.map((item) => (
													<span
														key={item.name}
														className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
													>
														<PackageIcon className="size-3 shrink-0" />
														<span className="truncate">
															{item.quantity}×{" "}
															{item.name}
														</span>
													</span>
												))}
											</div>
										)}
									</div>
								);
							})}
						</div>
						{customers.length > visibleCustomers.length && (
							<p className="mt-3 text-center text-muted-foreground text-xs">
								Showing {visibleCustomers.length} of{" "}
								{customers.length}
							</p>
						)}
					</CardContent>
				</Card>
			)}

			{/* Recent ledger */}
			{wallet && wallet.recentEntries.length > 0 && (
				<Card>
					<CardContent className="p-4">
						<p className="mb-2 font-medium text-sm">
							Recent activity
						</p>
						<div className="space-y-2">
							{wallet.recentEntries.slice(0, 8).map((entry) => (
								<div
									key={entry.id}
									className="flex items-center justify-between gap-2 text-sm"
								>
									<span className="line-clamp-1 flex-1 text-muted-foreground">
										{entry.notes ??
											entry.type
												.toLowerCase()
												.replace(/_/g, " ")}
									</span>
									<span className="font-mono tabular-nums">
										{formatCurrency(Math.abs(entry.amount))}
									</span>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
