"use client";

import { useActiveOrganization } from "@saas/organizations/client";
import { formatCurrency, formatDate } from "@shared/lib/format";
import { Link } from "@tanstack/react-router";
import { Badge } from "@ui/components/badge";
import { Card, CardContent } from "@ui/components/card";
import { Skeleton } from "@ui/components/skeleton";
import { cn } from "@ui/lib";
import {
	ChevronRightIcon,
	ClipboardListIcon,
	HistoryIcon,
	PackageIcon,
	PhoneIcon,
	ReceiptIcon,
	UserPlusIcon,
	UsersIcon,
	WalletIcon,
} from "lucide-react";
import {
	useMyCustomerItemsQuery,
	useMyCustomersQuery,
	useMyStatsQuery,
	useMyWalletQuery,
} from "../hooks/use-worker";
import { formatWhen, SectionHeader, StatStrip } from "./WorkerUI";

const STATUS_VARIANTS: Record<string, "success" | "info" | "outline"> = {
	ACTIVE: "success",
	PENDING: "info",
};

/** Turn a ledger entry type like NEW_USER_SETUP into "New user setup". */
function humanizeType(type: string): string {
	const lower = type.toLowerCase().replace(/_/g, " ");
	return lower.charAt(0).toUpperCase() + lower.slice(1);
}

// react-doctor-disable-next-line react-doctor/no-giant-component -- cohesive worker dashboard; length is sequential summary sections over shared queries, splitting would scatter the data flow
export function WorkerHome() {
	const { activeOrganization } = useActiveOrganization();
	const { wallet, isLoading: walletLoading } = useMyWalletQuery();
	const { stats, isLoading: statsLoading } = useMyStatsQuery();
	const { customers } = useMyCustomersQuery();
	const { byCustomer } = useMyCustomerItemsQuery();

	const orgSlug = activeOrganization?.slug ?? "";
	const openTasks = stats?.tasks.open ?? 0;

	const visibleCustomers = [...customers]
		.sort((a, b) =>
			a.status === "PENDING" ? -1 : b.status === "PENDING" ? 1 : 0,
		)
		.slice(0, 10);

	const totalToCollect = customers.reduce(
		(sum, c) =>
			sum +
			(c.monthlyRate ?? 0) +
			(byCustomer[c.id]?.equipmentTotal ?? 0),
		0,
	);

	const balance = wallet?.balance ?? 0;

	const kpis = [
		{
			label: "New users",
			value: String(stats?.customers.createdThisMonth ?? 0),
			hint: "this month",
			icon: UserPlusIcon,
		},
		{
			label: "Items",
			value: String(stats?.installations.itemsThisMonth ?? 0),
			hint: "installed (mo)",
			icon: PackageIcon,
		},
		{
			label: "Open tasks",
			value: String(openTasks),
			icon: ClipboardListIcon,
			tone: openTasks > 0 ? ("warning" as const) : ("default" as const),
		},
		{
			label: "To collect",
			value: formatCurrency(totalToCollect),
			icon: WalletIcon,
		},
	];

	return (
		<div className="space-y-5">
			{/* Date header */}
			<div className="flex items-center justify-between gap-3">
				<div className="min-w-0">
					<p className="text-muted-foreground text-xs uppercase tracking-wide">
						Today
					</p>
					<p
						className="truncate font-semibold text-base"
						suppressHydrationWarning
					>
						{formatDate(new Date(), {
							weekday: "long",
							day: "numeric",
							month: "long",
						})}
					</p>
				</div>
				<Link
					to="/work/$organizationSlug/tasks"
					params={{ organizationSlug: orgSlug }}
					className="flex shrink-0 items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 font-medium text-sm"
				>
					<ClipboardListIcon className="size-4 text-primary" />
					<span className="tabular-nums">{openTasks}</span>
					<span className="text-muted-foreground">open</span>
				</Link>
			</div>

			{/* Wallet hero */}
			<Card>
				<CardContent className="p-5">
					<div className="flex items-center gap-2 text-muted-foreground">
						<WalletIcon className="size-4" />
						<span className="text-sm">Cash on hand</span>
					</div>
					{walletLoading ? (
						<Skeleton className="mt-2 h-9 w-32" />
					) : (
						<p
							className={cn(
								"mt-1 font-semibold text-3xl tabular-nums",
								balance < 0 && "text-destructive",
							)}
						>
							{formatCurrency(balance)}
						</p>
					)}
					{wallet && (
						<div className="mt-4 grid grid-cols-2 gap-3 border-t pt-3">
							<div>
								<p className="text-muted-foreground text-xs">
									Pending expenses
								</p>
								<p className="font-medium text-foreground text-sm tabular-nums">
									{formatCurrency(
										wallet.pendingExpensesAmount,
									)}{" "}
									<span className="text-muted-foreground">
										({wallet.pendingExpensesCount})
									</span>
								</p>
							</div>
							<div>
								<p className="text-muted-foreground text-xs">
									Approved expenses
								</p>
								<p className="font-medium text-foreground text-sm tabular-nums">
									{formatCurrency(
										wallet.approvedExpensesAmount,
									)}{" "}
									<span className="text-muted-foreground">
										({wallet.approvedExpensesCount})
									</span>
								</p>
							</div>
						</div>
					)}
				</CardContent>
			</Card>

			{/* This-month KPIs */}
			<StatStrip items={kpis} isLoading={statsLoading} />

			{/* Quick actions */}
			<div className="grid grid-cols-2 gap-3">
				<Link
					to="/work/$organizationSlug/new-customer"
					params={{ organizationSlug: orgSlug }}
					className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3.5 font-medium text-primary-foreground text-sm active:opacity-90"
				>
					<UserPlusIcon className="size-4" />
					New customer
				</Link>
				<Link
					to="/work/$organizationSlug/expenses"
					params={{ organizationSlug: orgSlug }}
					className="flex items-center justify-center gap-2 rounded-lg border bg-background px-4 py-3.5 font-medium text-sm active:bg-muted"
				>
					<ReceiptIcon className="size-4" />
					Submit expense
				</Link>
			</div>

			{/* My customers */}
			{customers.length > 0 && (
				<div className="space-y-2">
					<SectionHeader
						icon={UsersIcon}
						title="My customers"
						action={
							<span className="text-muted-foreground text-xs tabular-nums">
								{customers.length}
							</span>
						}
					/>
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
									className="flex flex-col gap-2 rounded-lg border bg-background p-3"
								>
									<div className="flex items-start justify-between gap-2">
										<div className="min-w-0">
											<p className="truncate font-medium text-sm">
												{name}
											</p>
											<p className="truncate text-muted-foreground text-xs">
												#{customer.accountNumber}
												{customer.groupName
													? ` · ${customer.groupName}`
													: ""}
											</p>
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
												To collect
											</p>
											<p className="font-mono font-semibold text-base tabular-nums">
												{formatCurrency(toCollect)}
											</p>
										</div>
										{customer.mobile ? (
											<a
												href={`tel:${customer.mobile}`}
												className="flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-primary text-xs"
											>
												<PhoneIcon className="size-3" />
												Call
											</a>
										) : customer.monthlyRate != null ? (
											<span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
												{formatCurrency(
													customer.monthlyRate,
												)}
												/mo
											</span>
										) : null}
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
						<p className="text-center text-muted-foreground text-xs">
							Showing {visibleCustomers.length} of{" "}
							{customers.length}
						</p>
					)}
				</div>
			)}

			{/* Recent activity */}
			{wallet && wallet.recentEntries.length > 0 && (
				<div className="space-y-2">
					<SectionHeader icon={HistoryIcon} title="Recent activity" />
					<Card>
						<CardContent className="divide-y p-0">
							{wallet.recentEntries.slice(0, 8).map((entry) => {
								const typeLabel = humanizeType(entry.type);
								return (
									<div
										key={entry.id}
										className="flex items-center justify-between gap-3 px-4 py-2.5"
									>
										<div className="min-w-0">
											<p className="truncate text-sm">
												{entry.notes ?? typeLabel}
											</p>
											<p className="truncate text-[11px] text-muted-foreground">
												{formatWhen(entry.collectedAt)}
												{entry.notes
													? ` · ${typeLabel}`
													: ""}
											</p>
										</div>
										<span className="shrink-0 font-mono text-sm tabular-nums">
											{formatCurrency(
												Math.abs(entry.amount),
											)}
										</span>
									</div>
								);
							})}
						</CardContent>
					</Card>
				</div>
			)}

			{/* Empty state — brand-new worker with nothing yet */}
			{!walletLoading &&
				customers.length === 0 &&
				(!wallet || wallet.recentEntries.length === 0) && (
					<div className="rounded-lg border border-dashed py-12 text-center">
						<UsersIcon className="mx-auto size-8 text-muted-foreground/40" />
						<p className="mt-3 text-muted-foreground text-sm">
							Nothing here yet.
						</p>
						<Link
							to="/work/$organizationSlug/new-customer"
							params={{ organizationSlug: orgSlug }}
							className="mt-3 inline-flex items-center gap-1 font-medium text-primary text-sm"
						>
							Add your first customer
							<ChevronRightIcon className="size-4" />
						</Link>
					</div>
				)}
		</div>
	);
}
