"use client";

import { useActiveOrganization } from "@saas/organizations/client";
import {
	ContentCard,
	ContentCardToolbar,
} from "@shared/components/ContentCard";
import { formatSmartPercent } from "@shared/components/charts/chart-utils";
import { EmptyState } from "@shared/components/EmptyState";
import {
	MetricCard,
	MetricCardSkeleton,
	MetricStrip,
} from "@shared/components/MetricCard";
import { SearchInput } from "@shared/components/SearchInput";
import { formatCurrency } from "@shared/lib/format";
import type { ColumnDef } from "@tanstack/react-table";
import { Avatar, AvatarFallback } from "@ui/components/avatar";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { DataTable } from "@ui/components/data-table";
import { Progress } from "@ui/components/progress";
import { Skeleton } from "@ui/components/skeleton";
import { Toggle } from "@ui/components/toggle";
import { cn } from "@ui/lib";
import {
	AlertTriangleIcon,
	BanknoteIcon,
	ChevronRightIcon,
	HandCoinsIcon,
	OctagonXIcon,
	PhoneIcon,
	RotateCcwIcon,
	UsersIcon,
	WalletIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useCollectors } from "../hooks/use-billing";

interface CollectorRow {
	id: string;
	name: string;
	username: string | null;
	phone: string | null;
	customerCount: number;
	inHand: number;
	monthCollected: number;
	monthTotal: number;
	stoppedCount: number;
	pendingStoppedCount: number;
}

function getInitials(name: string): string {
	return name
		.split(/\s+/)
		.slice(0, 2)
		.map((w) => w[0] ?? "")
		.join("")
		.toUpperCase();
}

function slugFor(c: { username: string | null; id: string }): string {
	return c.username ?? c.id;
}

export function CollectorsHub() {
	const { data, isLoading } = useCollectors();
	const collectors: CollectorRow[] = data?.collectors ?? [];
	const { activeOrganization } = useActiveOrganization();
	const basePath = activeOrganization
		? `/app/${activeOrganization.slug}/billing/collectors`
		: "";

	const [search, setSearch] = useState("");
	const [withBalanceOnly, setWithBalanceOnly] = useState(false);
	const [needsAttentionOnly, setNeedsAttentionOnly] = useState(false);

	const filtered = useMemo(() => {
		const term = search.trim().toLowerCase();
		return collectors.filter((c) => {
			if (
				term &&
				!`${c.name} ${c.username ?? ""}`.toLowerCase().includes(term)
			) {
				return false;
			}
			if (withBalanceOnly && c.inHand <= 0) {
				return false;
			}
			if (
				needsAttentionOnly &&
				c.pendingStoppedCount === 0 &&
				c.stoppedCount === 0
			) {
				return false;
			}
			return true;
		});
	}, [collectors, search, withBalanceOnly, needsAttentionOnly]);

	const totals = useMemo(() => {
		const sumInHand = collectors.reduce((s, c) => s + c.inHand, 0);
		const sumMonthCollected = collectors.reduce(
			(s, c) => s + c.monthCollected,
			0,
		);
		const sumMonthTotal = collectors.reduce((s, c) => s + c.monthTotal, 0);
		const sumCustomers = collectors.reduce(
			(s, c) => s + c.customerCount,
			0,
		);
		const sumStopped = collectors.reduce((s, c) => s + c.stoppedCount, 0);
		const sumPending = collectors.reduce(
			(s, c) => s + c.pendingStoppedCount,
			0,
		);
		const collectionPct =
			sumMonthTotal > 0 ? (sumMonthCollected / sumMonthTotal) * 100 : 0;
		return {
			sumInHand,
			sumMonthCollected,
			sumMonthTotal,
			sumCustomers,
			sumStopped,
			sumPending,
			collectionPct,
		};
	}, [collectors]);

	const hasActiveFilters = search || withBalanceOnly || needsAttentionOnly;
	const resetFilters = () => {
		setSearch("");
		setWithBalanceOnly(false);
		setNeedsAttentionOnly(false);
	};

	const columns = useMemo<ColumnDef<CollectorRow, unknown>[]>(
		() => [
			{
				id: "name",
				header: "Collector",
				cell: ({ row }) => {
					const c = row.original;
					return (
						<a
							href={`${basePath}/${slugFor(c)}`}
							className="group flex min-w-0 items-center gap-2.5"
						>
							<Avatar className="size-8 shrink-0">
								<AvatarFallback className="bg-primary/10 text-[11px] font-semibold text-primary">
									{getInitials(c.name)}
								</AvatarFallback>
							</Avatar>
							<div className="min-w-0">
								<div className="truncate text-sm font-medium leading-tight group-hover:text-primary">
									{c.name}
								</div>
								<div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
									{c.username && (
										<span className="truncate">
											@{c.username}
										</span>
									)}
									{c.phone && (
										<>
											<span className="opacity-30">
												·
											</span>
											<PhoneIcon className="size-2.5 shrink-0" />
											<span className="truncate tabular-nums">
												{c.phone}
											</span>
										</>
									)}
								</div>
							</div>
						</a>
					);
				},
			},
			{
				id: "customers",
				header: "Customers",
				meta: { className: "text-right" },
				cell: ({ row }) => (
					<span className="block text-right text-sm tabular-nums">
						{row.original.customerCount}
					</span>
				),
			},
			{
				id: "progress",
				header: "Progress",
				cell: ({ row }) => {
					const c = row.original;
					const pct =
						c.monthTotal > 0
							? Math.round(
									(c.monthCollected / c.monthTotal) * 100,
								)
							: 0;
					return (
						<div className="min-w-[8rem] max-w-[14rem]">
							<div className="flex items-baseline justify-between text-[11px] tabular-nums">
								<span className="text-muted-foreground">
									{c.monthCollected}
									<span className="opacity-50">
										/{c.monthTotal}
									</span>
								</span>
								<span
									className={cn(
										"font-medium",
										pct >= 80
											? "text-success"
											: pct >= 40
												? "text-warning"
												: "text-muted-foreground",
									)}
								>
									{formatSmartPercent(pct)}
								</span>
							</div>
							<Progress value={pct} className="mt-1 h-1" />
						</div>
					);
				},
			},
			{
				id: "inHand",
				header: "In hand",
				meta: { className: "text-right" },
				cell: ({ row }) => {
					const v = row.original.inHand;
					return (
						<span
							className={cn(
								"block text-right text-sm font-medium tabular-nums",
								v > 0
									? "text-warning"
									: "text-muted-foreground/60",
							)}
						>
							{formatCurrency(v)}
						</span>
					);
				},
			},
			{
				id: "flags",
				header: "Flags",
				cell: ({ row }) => {
					const c = row.original;
					if (!c.stoppedCount && !c.pendingStoppedCount) {
						return (
							<span className="text-xs text-muted-foreground/40">
								—
							</span>
						);
					}
					return (
						<div className="flex flex-wrap items-center gap-1">
							{c.pendingStoppedCount > 0 && (
								<Badge
									variant="outline"
									className="border-warning/40 bg-warning/10 text-warning"
								>
									<AlertTriangleIcon className="size-2.5" />
									{c.pendingStoppedCount} pending
								</Badge>
							)}
							{c.stoppedCount > 0 && (
								<Badge
									variant="outline"
									className="border-destructive/40 bg-destructive/10 text-destructive"
								>
									<OctagonXIcon className="size-2.5" />
									{c.stoppedCount} stopped
								</Badge>
							)}
						</div>
					);
				},
			},
			{
				id: "chevron",
				header: "",
				meta: { className: "w-8 text-right" },
				cell: ({ row }) => (
					<a
						href={`${basePath}/${slugFor(row.original)}`}
						aria-label={`Open ${row.original.name}`}
						className="inline-flex size-7 items-center justify-center rounded text-muted-foreground/50 hover:bg-muted hover:text-foreground"
					>
						<ChevronRightIcon className="size-4" />
					</a>
				),
			},
		],
		[basePath],
	);

	return (
		<div className="space-y-6">
			<MetricStrip columns={5}>
				{isLoading ? (
					<>
						<MetricCardSkeleton />
						<MetricCardSkeleton />
						<MetricCardSkeleton />
						<MetricCardSkeleton />
						<MetricCardSkeleton />
					</>
				) : (
					<>
						<MetricCard
							label="Cash in field"
							value={formatCurrency(totals.sumInHand)}
							icon={WalletIcon}
							tone={totals.sumInHand > 0 ? "warning" : "default"}
							hint="Held by collectors"
						/>
						<MetricCard
							label="Collection rate"
							value={formatSmartPercent(totals.collectionPct)}
							icon={BanknoteIcon}
							tone={
								totals.collectionPct >= 80
									? "success"
									: totals.collectionPct >= 40
										? "warning"
										: "default"
							}
							hint={`${totals.sumMonthCollected} / ${totals.sumMonthTotal} bills`}
						/>
						<MetricCard
							label="Customers covered"
							value={totals.sumCustomers}
							icon={UsersIcon}
							hint={`Across ${collectors.length} collectors`}
						/>
						<MetricCard
							label="Pending review"
							value={totals.sumPending}
							icon={AlertTriangleIcon}
							tone={totals.sumPending > 0 ? "warning" : "default"}
							hint="Awaiting admin"
						/>
						<MetricCard
							label="Stopped"
							value={totals.sumStopped}
							icon={OctagonXIcon}
							tone={totals.sumStopped > 0 ? "danger" : "default"}
							hint="This cycle"
						/>
					</>
				)}
			</MetricStrip>

			<ContentCard>
				<ContentCardToolbar>
					<SearchInput
						value={search}
						onChange={setSearch}
						placeholder="Search by name or username..."
						className="w-full sm:max-w-xs"
					/>
					<Toggle
						pressed={withBalanceOnly}
						onPressedChange={setWithBalanceOnly}
						size="sm"
						aria-label="Show collectors with cash in hand only"
					>
						<HandCoinsIcon className="size-3.5" />
						With balance
					</Toggle>
					<Toggle
						pressed={needsAttentionOnly}
						onPressedChange={setNeedsAttentionOnly}
						size="sm"
						aria-label="Show collectors needing attention only"
					>
						<AlertTriangleIcon className="size-3.5" />
						Needs attention
					</Toggle>
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
				</ContentCardToolbar>

				<DataTable
					columns={columns}
					data={filtered}
					isLoading={isLoading}
					pageSize={25}
					emptyState={
						<EmptyState
							icon={UsersIcon}
							title={
								collectors.length === 0
									? "No collectors yet"
									: "No collectors match"
							}
							description={
								collectors.length === 0
									? "Once you assign collectors to customers they'll show up here."
									: "Try clearing your filters."
							}
						/>
					}
				/>
			</ContentCard>
		</div>
	);
}

export function CollectorsHubSkeleton() {
	return (
		<div className="space-y-6">
			<MetricStrip columns={5}>
				{Array.from({ length: 5 }).map((_, i) => (
					<MetricCardSkeleton key={i} />
				))}
			</MetricStrip>
			<div className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
				<div className="border-b border-border bg-surface-subtle/40 px-3 py-2.5 md:px-4">
					<Skeleton className="h-8 w-64" />
				</div>
				<div className="divide-y divide-border">
					{Array.from({ length: 8 }).map((_, i) => (
						<div
							key={`row-${i}`}
							className="flex items-center gap-4 px-4 py-3"
						>
							<Skeleton className="size-8 rounded-full" />
							<div className="flex-1 space-y-1.5">
								<Skeleton className="h-3.5 w-40" />
								<Skeleton className="h-2.5 w-24" />
							</div>
							<Skeleton className="hidden h-2 w-32 md:block" />
							<Skeleton className="h-3.5 w-16" />
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
