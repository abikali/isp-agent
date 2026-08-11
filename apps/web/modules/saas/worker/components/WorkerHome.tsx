"use client";

import { useActiveOrganization } from "@saas/organizations/client";
import { formatCurrency, formatDate } from "@shared/lib/format";
import { Link } from "@tanstack/react-router";
import { Badge } from "@ui/components/badge";
import { Card, CardContent } from "@ui/components/card";
import { Skeleton } from "@ui/components/skeleton";
import { cn } from "@ui/lib";
import type { LucideIcon } from "lucide-react";
import {
	ClipboardListIcon,
	HistoryIcon,
	HourglassIcon,
	PackageIcon,
	PhoneIcon,
	ReceiptIcon,
	UserPlusIcon,
	UsersIcon,
	WalletIcon,
	WrenchIcon,
} from "lucide-react";
import {
	useMyMonthCustomersQuery,
	useMyStatsQuery,
	useMyWalletQuery,
} from "../hooks/use-worker";
import { formatWhen, SectionHeader, StatStrip } from "./WorkerUI";

const STATUS_VARIANTS: Record<string, "success" | "info" | "outline"> = {
	ACTIVE: "success",
	PENDING: "info",
};

/** Only ever a handful of cards on screen — the rest stay in the group total. */
const MAX_CARDS_PER_GROUP = 8;

type MonthCustomer = ReturnType<
	typeof useMyMonthCustomersQuery
>["customers"][number];

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
	const {
		customers,
		newTotal,
		serviceTotal,
		totalToCollect,
		isLoading: customersLoading,
	} = useMyMonthCustomersQuery();

	const orgSlug = activeOrganization?.slug ?? "";
	const openTasks = stats?.tasks.open ?? 0;

	const newCustomers = customers.filter((c) => c.kind === "NEW");
	const servicedCustomers = customers.filter((c) => c.kind === "SERVICE");

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
			hint: "this month",
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

			{/* Customers worked on this month */}
			{!customersLoading && (
				<div className="space-y-3">
					<SectionHeader
						icon={UsersIcon}
						title="My customers this month"
						action={
							<span className="text-muted-foreground text-xs tabular-nums">
								{customers.length}
							</span>
						}
					/>
					{customers.length === 0 ? (
						<p className="rounded-lg border border-dashed px-4 py-6 text-center text-muted-foreground text-xs">
							No new customers or service visits yet this month.
						</p>
					) : (
						<>
							<CustomerGroup
								icon={UserPlusIcon}
								label="New customers"
								total={newTotal}
								customers={newCustomers}
							/>
							<CustomerGroup
								icon={WrenchIcon}
								label="Serviced"
								total={serviceTotal}
								customers={servicedCustomers}
							/>
						</>
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
		</div>
	);
}

/**
 * One labelled bucket of this month's customers with its own money total, so a
 * worker can see at a glance what he owes for sign-ups versus for service work.
 * Renders nothing when the bucket is empty.
 */
// react-doctor-disable-next-line react-doctor/no-multi-comp -- customer card colocated with the home tab that owns it
function CustomerGroup({
	icon: Icon,
	label,
	total,
	customers,
}: {
	icon: LucideIcon;
	label: string;
	total: number;
	customers: MonthCustomer[];
}) {
	if (customers.length === 0) {
		return null;
	}

	const visible = customers.slice(0, MAX_CARDS_PER_GROUP);
	const hidden = customers.length - visible.length;

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between gap-2">
				<p className="flex min-w-0 items-center gap-1.5 font-medium text-sm">
					<Icon className="size-4 shrink-0 text-muted-foreground" />
					<span className="truncate">{label}</span>
					<span className="text-muted-foreground tabular-nums">
						({customers.length})
					</span>
				</p>
				{total > 0 && (
					<span className="shrink-0 font-mono text-sm tabular-nums">
						{formatCurrency(total)}
					</span>
				)}
			</div>
			<div className="grid gap-2 sm:grid-cols-2">
				{visible.map((customer) => (
					<div
						key={customer.id}
						className="flex flex-col gap-2 rounded-lg border bg-background p-3"
					>
						<div className="flex items-start justify-between gap-2">
							<div className="min-w-0">
								<p className="truncate font-medium text-sm">
									{customer.name}
								</p>
								<p className="truncate text-muted-foreground text-xs">
									#{customer.accountNumber}
									{customer.groupName
										? ` · ${customer.groupName}`
										: ""}
								</p>
							</div>
							{customer.kind === "NEW" ? (
								<Badge
									variant={
										STATUS_VARIANTS[customer.status] ??
										"outline"
									}
								>
									{customer.status.toLowerCase()}
								</Badge>
							) : (
								<span className="shrink-0 text-[11px] text-muted-foreground">
									{formatWhen(customer.lastActivityAt)}
								</span>
							)}
						</div>

						{customer.pendingApproval && (
							<p className="flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-300">
								<HourglassIcon className="size-3 shrink-0" />
								Waiting for office approval
							</p>
						)}

						<div className="flex items-end justify-between gap-2">
							<div className="min-w-0">
								{customer.toCollect > 0 ? (
									<>
										<p className="text-[11px] text-muted-foreground">
											To collect
										</p>
										<p className="font-mono font-semibold text-base tabular-nums">
											{formatCurrency(customer.toCollect)}
										</p>
									</>
								) : (
									<p className="text-muted-foreground text-xs">
										{customer.visits > 0
											? `${customer.visits} visit${customer.visits > 1 ? "s" : ""} this month`
											: "Nothing to collect"}
									</p>
								)}
							</div>
							{customer.mobile && (
								<a
									href={`tel:${customer.mobile}`}
									className="flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-primary text-xs"
								>
									<PhoneIcon className="size-3" />
									Call
								</a>
							)}
						</div>

						{customer.items.length > 0 && (
							<div className="flex flex-wrap gap-1 border-t pt-2">
								{customer.items.map((item) => (
									<span
										key={item.name}
										className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
									>
										<PackageIcon className="size-3 shrink-0" />
										<span className="truncate">
											{item.quantity}× {item.name}
										</span>
									</span>
								))}
							</div>
						)}
					</div>
				))}
			</div>
			{hidden > 0 && (
				<p className="text-center text-muted-foreground text-xs">
					+{hidden} more · already counted in the total above
				</p>
			)}
		</div>
	);
}
