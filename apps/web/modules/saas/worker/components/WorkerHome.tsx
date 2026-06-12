"use client";

import { useActiveOrganization } from "@saas/organizations/client";
import { formatCurrency } from "@shared/lib/format";
import { Link } from "@tanstack/react-router";
import { Badge } from "@ui/components/badge";
import { Card, CardContent } from "@ui/components/card";
import { Skeleton } from "@ui/components/skeleton";
import {
	BoxesIcon,
	ClipboardListIcon,
	ReceiptIcon,
	UserPlusIcon,
	WalletIcon,
	WrenchIcon,
} from "lucide-react";
import {
	useMyCustomersQuery,
	useMyInstallationsQuery,
	useMyStockQuery,
	useMyTasksQuery,
	useMyWalletQuery,
} from "../hooks/use-worker";

export function WorkerHome() {
	const { activeOrganization } = useActiveOrganization();
	const { wallet, isLoading: walletLoading } = useMyWalletQuery();
	const { tasks } = useMyTasksQuery();
	const { allocations, totalValue } = useMyStockQuery();
	const { installations } = useMyInstallationsQuery();
	const { customers } = useMyCustomersQuery();

	const orgSlug = activeOrganization?.slug ?? "";
	const pendingInstalls = installations.filter(
		(i) => i.status === "PENDING",
	).length;

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
						<p className="mt-1 text-3xl font-semibold tabular-nums">
							{formatCurrency(wallet?.balance ?? 0)}
						</p>
					)}
					{wallet && (
						<div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
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

			{/* Quick stats */}
			<div className="grid grid-cols-3 gap-3">
				<Link
					to="/work/$organizationSlug/tasks"
					params={{ organizationSlug: orgSlug }}
				>
					<Card>
						<CardContent className="p-4 text-center">
							<ClipboardListIcon className="mx-auto size-5 text-muted-foreground" />
							<p className="mt-1 text-xl font-semibold tabular-nums">
								{tasks.length}
							</p>
							<p className="text-xs text-muted-foreground">
								Open tasks
							</p>
						</CardContent>
					</Card>
				</Link>
				<Link
					to="/work/$organizationSlug/stock"
					params={{ organizationSlug: orgSlug }}
				>
					<Card>
						<CardContent className="p-4 text-center">
							<BoxesIcon className="mx-auto size-5 text-muted-foreground" />
							<p className="mt-1 text-xl font-semibold tabular-nums">
								{allocations.reduce(
									(sum, a) => sum + a.quantity,
									0,
								)}
							</p>
							<p className="text-xs text-muted-foreground">
								Stock ({formatCurrency(totalValue)})
							</p>
						</CardContent>
					</Card>
				</Link>
				<Link
					to="/work/$organizationSlug/install"
					params={{ organizationSlug: orgSlug }}
				>
					<Card>
						<CardContent className="p-4 text-center">
							<WrenchIcon className="mx-auto size-5 text-muted-foreground" />
							<p className="mt-1 text-xl font-semibold tabular-nums">
								{pendingInstalls}
							</p>
							<p className="text-xs text-muted-foreground">
								Pending installs
							</p>
						</CardContent>
					</Card>
				</Link>
			</div>

			{/* Quick actions */}
			<div className="grid grid-cols-2 gap-3">
				<Link
					to="/work/$organizationSlug/new-customer"
					params={{ organizationSlug: orgSlug }}
					className="flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
				>
					<UserPlusIcon className="size-4" />
					New customer
				</Link>
				<Link
					to="/work/$organizationSlug/expenses"
					params={{ organizationSlug: orgSlug }}
					className="flex items-center justify-center gap-2 rounded-md border bg-background px-4 py-3 text-sm font-medium"
				>
					<ReceiptIcon className="size-4" />
					Submit expense
				</Link>
			</div>

			{/* My customers (legacy worker.php approved/pending lists) */}
			{customers.length > 0 && (
				<Card>
					<CardContent className="p-4">
						<div className="mb-2 flex items-center justify-between">
							<p className="text-sm font-medium">My customers</p>
							<span className="text-xs text-muted-foreground tabular-nums">
								{customers.length}
							</span>
						</div>
						<div className="space-y-2">
							{[...customers]
								.sort((a, b) =>
									a.status === "PENDING"
										? -1
										: b.status === "PENDING"
											? 1
											: 0,
								)
								.slice(0, 10)
								.map((customer) => {
									const name =
										[customer.firstName, customer.lastName]
											.filter(Boolean)
											.join(" ") ||
										customer.accountNumber;
									return (
										<div
											key={customer.id}
											className="flex items-center justify-between gap-2 text-sm"
										>
											<div className="min-w-0">
												<p className="truncate font-medium">
													{name}
												</p>
												{customer.groupName && (
													<p className="truncate text-xs text-muted-foreground">
														{customer.groupName}
													</p>
												)}
											</div>
											<div className="flex items-center gap-2">
												{customer.monthlyRate !=
													null && (
													<span className="font-mono text-xs tabular-nums text-muted-foreground">
														{formatCurrency(
															customer.monthlyRate,
														)}
													</span>
												)}
												<Badge
													variant={
														customer.status ===
														"ACTIVE"
															? "success"
															: customer.status ===
																	"PENDING"
																? "info"
																: "outline"
													}
												>
													{customer.status.toLowerCase()}
												</Badge>
											</div>
										</div>
									);
								})}
						</div>
					</CardContent>
				</Card>
			)}

			{/* Recent ledger */}
			{wallet && wallet.recentEntries.length > 0 && (
				<Card>
					<CardContent className="p-4">
						<p className="mb-2 text-sm font-medium">
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
