"use client";

import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import {
	ContentCard,
	ContentCardSection,
} from "@shared/components/ContentCard";
import { TopConsumersChart } from "@shared/components/charts";
import { formatBytes } from "@shared/components/charts/chart-utils";
import {
	MetricCard,
	MetricCardSkeleton,
	MetricStrip,
} from "@shared/components/MetricCard";
import { useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import {
	useIsFetching,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import {
	type UseNavigateResult,
	useNavigate,
	useParams,
} from "@tanstack/react-router";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@ui/components/popover";
import { Skeleton } from "@ui/components/skeleton";
import { cn } from "@ui/lib";
import {
	ActivityIcon,
	AlertTriangleIcon,
	ArrowUpRightIcon,
	CalendarXIcon,
	CheckCircleIcon,
	ClockIcon,
	GaugeIcon,
	HistoryIcon,
	RadioIcon,
	RefreshCwIcon,
	RouterIcon,
	UsersIcon,
	WifiIcon,
	WifiOffIcon,
	XCircleIcon,
	ZapIcon,
} from "lucide-react";

const FIVE_MINUTES = 5 * 60 * 1000;

function formatRelative(d: Date | string | null): string {
	if (!d) {
		return "—";
	}
	const date = typeof d === "string" ? new Date(d) : d;
	const diffMs = Date.now() - date.getTime();
	const mins = Math.floor(diffMs / 60_000);
	if (mins < 1) {
		return "Just now";
	}
	if (mins < 60) {
		return `${mins}m ago`;
	}
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) {
		return `${hrs}h ago`;
	}
	return `${Math.floor(hrs / 24)}d ago`;
}

function latencyTone(ms: number): "success" | "warning" | "destructive" {
	if (ms < 200) {
		return "success";
	}
	if (ms < 500) {
		return "warning";
	}
	return "destructive";
}

export function IRadiusControlCenter() {
	const organizationId = useOrganizationId();
	if (!organizationId) {
		return null;
	}
	return <IRadiusControlCenterInner organizationId={organizationId} />;
}

function IRadiusControlCenterInner({
	organizationId,
}: {
	organizationId: string;
}) {
	const { organizationSlug } = useParams({ strict: false }) as {
		organizationSlug?: string;
	};
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const isRefreshing = useIsFetching({ queryKey: orpc.iradius.key() }) > 0;

	const refresh = () => {
		queryClient.invalidateQueries({ queryKey: orpc.iradius.key() });
	};

	return (
		<div className="space-y-4">
			<AsyncBoundary fallback={<HeroSkeleton />}>
				<Hero
					organizationId={organizationId}
					organizationSlug={organizationSlug}
					navigate={navigate}
					isRefreshing={isRefreshing}
					onRefresh={refresh}
				/>
			</AsyncBoundary>

			<AsyncBoundary fallback={<LiveMetricsSkeleton />}>
				<LiveMetrics
					organizationId={organizationId}
					organizationSlug={organizationSlug}
					navigate={navigate}
				/>
			</AsyncBoundary>

			<div className="grid gap-4 md:grid-cols-2">
				<AsyncBoundary fallback={<NasListSkeleton kind="stations" />}>
					<StationsCard organizationId={organizationId} />
				</AsyncBoundary>
				<AsyncBoundary
					fallback={<NasListSkeleton kind="access points" />}
				>
					<AccessPointsCard organizationId={organizationId} />
				</AsyncBoundary>
			</div>

			<AsyncBoundary fallback={<TopConsumersSkeleton />}>
				<TopConsumers
					organizationId={organizationId}
					organizationSlug={organizationSlug}
					navigate={navigate}
				/>
			</AsyncBoundary>
		</div>
	);
}

// ─── Hero ───────────────────────────────────────────────────

function Hero({
	organizationId,
	organizationSlug,
	navigate,
	isRefreshing,
	onRefresh,
}: {
	organizationId: string;
	organizationSlug: string | undefined;
	navigate: UseNavigateResult<string>;
	isRefreshing: boolean;
	onRefresh: () => void;
}) {
	const { data: health } = useSuspenseQuery({
		...orpc.iradius.health.queryOptions({ input: { organizationId } }),
		staleTime: FIVE_MINUTES,
	});
	const { data: syncs } = useSuspenseQuery({
		...orpc.iradius.recentSyncs.queryOptions({
			input: { organizationId, limit: 5 },
		}),
		staleTime: FIVE_MINUTES,
	});

	const lastSync = syncs.operations[0];
	const lastSyncRelative = lastSync
		? formatRelative(lastSync.completedAt ?? lastSync.createdAt)
		: "Never";
	const latTone = latencyTone(health.latencyMs);

	return (
		<ContentCard>
			<div className="flex flex-wrap items-center gap-4 p-4 md:p-5">
				<div
					className={cn(
						"flex size-12 shrink-0 items-center justify-center rounded-lg",
						health.ok
							? "bg-success/10 text-success"
							: "bg-destructive/10 text-destructive",
					)}
				>
					{health.ok ? (
						<CheckCircleIcon className="size-6" />
					) : (
						<XCircleIcon className="size-6" />
					)}
				</div>
				<div className="min-w-0 flex-1">
					<div className="text-base font-semibold leading-tight">
						{health.ok
							? "iRadius is reachable"
							: "iRadius is unreachable"}
					</div>
					<div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
						<Chip tone={latTone}>
							<GaugeIcon className="size-3" />
							<span className="font-mono tabular-nums">
								{health.latencyMs}ms
							</span>
						</Chip>
						<Popover>
							<PopoverTrigger asChild>
								<button
									type="button"
									className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 text-xs text-foreground hover:bg-accent/40 hover:border-border-strong transition-colors"
								>
									<HistoryIcon className="size-3 text-muted-foreground" />
									Last sync{" "}
									<span className="font-medium">
										{lastSyncRelative}
									</span>
								</button>
							</PopoverTrigger>
							<PopoverContent align="start" className="w-80 p-0">
								<SyncHistoryPopover syncs={syncs.operations} />
							</PopoverContent>
						</Popover>
						{health.counts && (
							<Chip>
								<UsersIcon className="size-3" />
								<span className="font-mono tabular-nums">
									{health.counts.subscribers.toLocaleString()}
								</span>{" "}
								<span className="text-muted-foreground/70">
									subscribers
								</span>
							</Chip>
						)}
						{health.counts && (
							<Chip>
								<RouterIcon className="size-3" />
								<span className="font-mono tabular-nums">
									{health.counts.stations}
								</span>{" "}
								<span className="text-muted-foreground/70">
									stations
								</span>
							</Chip>
						)}
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={onRefresh}
						disabled={isRefreshing}
					>
						<RefreshCwIcon
							className={cn(
								"size-3.5",
								isRefreshing && "animate-spin",
							)}
						/>
						{isRefreshing ? "Refreshing…" : "Refresh"}
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={() =>
							navigate({
								to: "/app/$organizationSlug/settings/iradius",
								params: {
									organizationSlug: organizationSlug ?? "",
								},
							})
						}
					>
						Sync settings
						<ArrowUpRightIcon className="size-3.5" />
					</Button>
				</div>
			</div>
		</ContentCard>
	);
}

function HeroSkeleton() {
	return (
		<ContentCard>
			<div className="flex flex-wrap items-center gap-4 p-4 md:p-5">
				<Skeleton className="size-12 rounded-lg" />
				<div className="min-w-0 flex-1 space-y-2">
					<Skeleton className="h-4 w-48" />
					<div className="flex gap-1.5">
						<Skeleton className="h-5 w-16" />
						<Skeleton className="h-5 w-28" />
						<Skeleton className="h-5 w-28" />
					</div>
				</div>
				<div className="flex gap-2">
					<Skeleton className="h-8 w-24" />
					<Skeleton className="h-8 w-32" />
				</div>
			</div>
		</ContentCard>
	);
}

function Chip({
	children,
	tone,
}: {
	children: React.ReactNode;
	tone?: "success" | "warning" | "destructive";
}) {
	const toneClass = tone
		? {
				success: "border-success/30 bg-success/10 text-success",
				warning: "border-warning/30 bg-warning/10 text-warning",
				destructive:
					"border-destructive/30 bg-destructive/10 text-destructive",
			}[tone]
		: "border-border bg-card text-foreground";
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs",
				toneClass,
			)}
		>
			{children}
		</span>
	);
}

function SyncHistoryPopover({
	syncs,
}: {
	syncs: ReadonlyArray<{
		id: string;
		status: string;
		completedAt: Date | string | null;
		createdAt: Date | string;
		processedCustomers: number;
		totalCustomers: number;
		totalConflicts: number;
		removedRecords: number;
	}>;
}) {
	return (
		<div>
			<div className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
				Recent sync runs
			</div>
			{syncs.length === 0 ? (
				<div className="px-3 py-6 text-center text-xs text-muted-foreground">
					No sync history yet
				</div>
			) : (
				<div className="max-h-80 overflow-auto">
					{syncs.map((op) => {
						const isActive =
							op.status === "running" || op.status === "pending";
						const failed = op.status === "failed";
						return (
							<div
								key={op.id}
								className="flex items-start gap-2.5 border-b border-border px-3 py-2 last:border-b-0"
							>
								<div
									className={cn(
										"mt-1.5 size-1.5 shrink-0 rounded-full",
										isActive
											? "bg-info animate-pulse"
											: failed
												? "bg-destructive"
												: "bg-success",
									)}
								/>
								<div className="min-w-0 flex-1">
									<div className="flex items-center justify-between gap-2 text-xs">
										<span className="font-medium capitalize">
											{op.status}
										</span>
										<span className="text-muted-foreground tabular-nums">
											{formatRelative(
												op.completedAt ?? op.createdAt,
											)}
										</span>
									</div>
									<div className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
										{op.processedCustomers.toLocaleString()}{" "}
										/ {op.totalCustomers.toLocaleString()}
										{op.totalConflicts > 0 && (
											<>
												{" · "}
												<span className="text-warning">
													{op.totalConflicts} conflict
													{op.totalConflicts === 1
														? ""
														: "s"}
												</span>
											</>
										)}
										{op.removedRecords > 0 && (
											<>
												{" · "}
												{op.removedRecords} removed
											</>
										)}
									</div>
								</div>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

// ─── Live metrics ───────────────────────────────────────────

function LiveMetrics({
	organizationId,
	organizationSlug,
	navigate,
}: {
	organizationId: string;
	organizationSlug: string | undefined;
	navigate: UseNavigateResult<string>;
}) {
	const { data: health } = useSuspenseQuery({
		...orpc.iradius.health.queryOptions({ input: { organizationId } }),
		staleTime: FIVE_MINUTES,
	});
	const { data: syncs } = useSuspenseQuery({
		...orpc.iradius.recentSyncs.queryOptions({
			input: { organizationId, limit: 5 },
		}),
		staleTime: FIVE_MINUTES,
	});

	if (!health.liveStats) {
		return null;
	}

	const onlinePct =
		health.liveStats.online + health.liveStats.offline > 0
			? Math.round(
					(health.liveStats.online /
						(health.liveStats.online + health.liveStats.offline)) *
						100,
				)
			: 0;

	return (
		<MetricStrip columns={6}>
			<MetricCard
				label="Online"
				value={health.liveStats.online.toLocaleString()}
				icon={WifiIcon}
				tone="success"
				hint={`${onlinePct}% of subscribers`}
			/>
			<MetricCard
				label="Offline"
				value={health.liveStats.offline.toLocaleString()}
				icon={WifiOffIcon}
				hint={`${100 - onlinePct}% of subscribers`}
			/>
			<MetricCard
				label="Active"
				value={health.liveStats.active.toLocaleString()}
				icon={UsersIcon}
				tone="info"
				hint={`of ${health.liveStats.totalSubscribers.toLocaleString()} total`}
			/>
			<MetricCard
				label="Expired"
				value={health.liveStats.expired.toLocaleString()}
				icon={CalendarXIcon}
				tone={health.liveStats.expired > 0 ? "warning" : "default"}
			/>
			<MetricCard
				label="In FUP"
				value={health.liveStats.fup.toLocaleString()}
				icon={ZapIcon}
				tone={health.liveStats.fup > 0 ? "warning" : "default"}
			/>
			<MetricCard
				label="Conflicts"
				value={syncs.pendingConflicts}
				icon={AlertTriangleIcon}
				tone={syncs.pendingConflicts > 0 ? "danger" : "default"}
				hint={
					syncs.pendingConflicts > 0
						? "Click to resolve"
						: "All resolved"
				}
				onClick={
					syncs.pendingConflicts > 0
						? () =>
								navigate({
									to: "/app/$organizationSlug/customers",
									params: {
										organizationSlug:
											organizationSlug ?? "",
									},
									search: {
										conflicts: "1",
									} as never,
								})
						: undefined
				}
			/>
		</MetricStrip>
	);
}

function LiveMetricsSkeleton() {
	return (
		<MetricStrip columns={6}>
			{Array.from({ length: 6 }).map((_, i) => (
				<MetricCardSkeleton key={i} />
			))}
		</MetricStrip>
	);
}

// ─── Stations card ──────────────────────────────────────────

function StationsCard({ organizationId }: { organizationId: string }) {
	const { data: nas } = useSuspenseQuery({
		...orpc.iradius.nasHealth.queryOptions({ input: { organizationId } }),
		staleTime: FIVE_MINUTES,
	});

	const onlineCount = nas.stations.filter((s) => s.online).length;
	const offlineCount = nas.stations.length - onlineCount;

	return (
		<NasCard
			title="Stations"
			subtitle="Tower & gateway telemetry"
			icon={RouterIcon}
			total={nas.stations.length}
			online={onlineCount}
			emptyText="No station telemetry available"
		>
			{nas.stations.slice(0, 8).map((s) => (
				<NasRow
					key={s.externalId}
					online={s.online}
					title={s.boardName ?? `Station ${s.externalId}`}
					subtitle={[
						s.version ? `v${s.version}` : null,
						s.uptime ?? null,
					]
						.filter(Boolean)
						.join(" · ")}
					trailing={
						s.cpuLoad ? (
							<MetricBadge icon={GaugeIcon} value={s.cpuLoad} />
						) : null
					}
				/>
			))}
			{nas.stations.length > 8 && (
				<FooterCount
					visible={8}
					offline={offlineCount}
					total={nas.stations.length}
				/>
			)}
		</NasCard>
	);
}

// ─── Access points card ─────────────────────────────────────

function AccessPointsCard({ organizationId }: { organizationId: string }) {
	const { data: nas } = useSuspenseQuery({
		...orpc.iradius.nasHealth.queryOptions({ input: { organizationId } }),
		staleTime: FIVE_MINUTES,
	});

	const onlineCount = nas.accessPoints.filter((a) => a.online).length;
	const offlineCount = nas.accessPoints.length - onlineCount;

	return (
		<NasCard
			title="Access points"
			subtitle="CPE / customer-side links"
			icon={RadioIcon}
			total={nas.accessPoints.length}
			online={onlineCount}
			emptyText="No AP telemetry available"
		>
			{nas.accessPoints.slice(0, 8).map((ap) => (
				<NasRow
					key={ap.externalId}
					online={ap.online}
					title={ap.boardName ?? `AP ${ap.externalId}`}
					subtitle={[
						ap.signal ? `${ap.signal} dBm` : null,
						ap.uptime ?? null,
					]
						.filter(Boolean)
						.join(" · ")}
					trailing={
						ap.fullDuplex ? (
							<Badge
								variant="outline"
								className="text-[10px] font-normal"
							>
								FD
							</Badge>
						) : null
					}
				/>
			))}
			{nas.accessPoints.length > 8 && (
				<FooterCount
					visible={8}
					offline={offlineCount}
					total={nas.accessPoints.length}
				/>
			)}
		</NasCard>
	);
}

// ─── NAS card primitives ────────────────────────────────────

function NasCard({
	title,
	subtitle,
	icon: Icon,
	total,
	online,
	emptyText,
	children,
}: {
	title: string;
	subtitle: string;
	icon: typeof RouterIcon;
	total: number;
	online: number;
	emptyText: string;
	children: React.ReactNode;
}) {
	const allOnline = total > 0 && online === total;
	const someOffline = total > 0 && online < total;
	return (
		<ContentCard>
			<div className="flex items-center gap-3 border-b border-border px-4 py-3 md:px-5">
				<Icon className="size-4 text-muted-foreground" />
				<div className="min-w-0 flex-1">
					<div className="text-sm font-medium">{title}</div>
					<div className="truncate text-[11px] text-muted-foreground">
						{subtitle}
					</div>
				</div>
				<div
					className={cn(
						"inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[11px] tabular-nums",
						allOnline
							? "border-success/30 bg-success/10 text-success"
							: someOffline
								? "border-warning/30 bg-warning/10 text-warning"
								: "border-border bg-card text-muted-foreground",
					)}
				>
					<span className="font-semibold">{online}</span>
					<span className="opacity-60">/</span>
					<span>{total}</span>
				</div>
			</div>
			{total === 0 ? (
				<div className="px-5 py-8 text-center text-sm text-muted-foreground">
					{emptyText}
				</div>
			) : (
				<div className="divide-y divide-border">{children}</div>
			)}
		</ContentCard>
	);
}

function NasRow({
	online,
	title,
	subtitle,
	trailing,
}: {
	online: boolean;
	title: string;
	subtitle: string;
	trailing?: React.ReactNode;
}) {
	return (
		<div className="flex items-center gap-3 px-4 py-2.5 text-sm md:px-5">
			{/* react-doctor-disable-next-line react-doctor/prefer-tag-over-role -- decorative CSS status dot; <img> is a void element needing a src and cannot render this styled span, so role="img"+aria-label is the right semantic */}
			<span
				role="img"
				className={cn(
					"size-2 shrink-0 rounded-full",
					online
						? "bg-success shadow-[0_0_0_3px] shadow-success/15"
						: "bg-muted-foreground/30",
				)}
				aria-label={online ? "online" : "offline"}
			/>
			<div className="min-w-0 flex-1">
				<div className="truncate font-medium leading-tight">
					{title}
				</div>
				{subtitle && (
					<div className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
						{subtitle}
					</div>
				)}
			</div>
			{trailing}
		</div>
	);
}

function MetricBadge({
	icon: Icon,
	value,
}: {
	icon: typeof GaugeIcon;
	value: string;
}) {
	return (
		<span className="inline-flex items-center gap-1 rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
			<Icon className="size-2.5" />
			{value}
		</span>
	);
}

function FooterCount({
	visible,
	offline,
	total,
}: {
	visible: number;
	offline: number;
	total: number;
}) {
	return (
		<div className="border-t border-border bg-surface-subtle/40 px-4 py-2 text-[11px] text-muted-foreground md:px-5">
			Showing {visible} of {total}
			{offline > 0 && (
				<>
					{" · "}
					<span className="text-warning">{offline} offline</span>
				</>
			)}
		</div>
	);
}

function NasListSkeleton({ kind }: { kind: string }) {
	return (
		<ContentCard>
			<div className="flex items-center gap-3 border-b border-border px-4 py-3 md:px-5">
				<Skeleton className="size-4 rounded" />
				<div className="min-w-0 flex-1 space-y-1.5">
					<Skeleton className="h-3.5 w-24" />
					<Skeleton className="h-2.5 w-36" />
				</div>
				<Skeleton className="h-5 w-14" />
			</div>
			<div className="divide-y divide-border">
				{Array.from({ length: 6 }).map((_, i) => (
					<div
						key={`${kind}-${i}`}
						className="flex items-center gap-3 px-4 py-2.5 md:px-5"
					>
						<Skeleton className="size-2 rounded-full" />
						<div className="min-w-0 flex-1 space-y-1.5">
							<Skeleton className="h-3 w-32" />
							<Skeleton className="h-2.5 w-24" />
						</div>
						<Skeleton className="h-4 w-12" />
					</div>
				))}
			</div>
		</ContentCard>
	);
}

// ─── Top bandwidth consumers ────────────────────────────────

function TopConsumers({
	organizationId,
	organizationSlug,
	navigate,
}: {
	organizationId: string;
	organizationSlug: string | undefined;
	navigate: UseNavigateResult<string>;
}) {
	const { data: topConsumers } = useSuspenseQuery({
		...orpc.iradius.topConsumers.queryOptions({
			input: { organizationId, limit: 10, window: "daily" },
		}),
		staleTime: FIVE_MINUTES,
	});

	return (
		<ContentCard>
			<div className="flex items-center gap-3 border-b border-border px-4 py-3 md:px-5">
				<ZapIcon className="size-4 text-muted-foreground" />
				<div className="min-w-0 flex-1">
					<div className="text-sm font-medium">
						Top bandwidth consumers
					</div>
					<div className="truncate text-[11px] text-muted-foreground">
						Highest daily traffic — download + upload
					</div>
				</div>
				<Badge variant="outline" className="text-[10px]">
					<ClockIcon className="size-2.5" />
					Today
				</Badge>
			</div>
			<ContentCardSection>
				{topConsumers.consumers.length === 0 ? (
					<p className="py-8 text-center text-sm text-muted-foreground">
						No bandwidth data yet — waiting for next sync
					</p>
				) : (
					<div className="grid gap-6 lg:grid-cols-[1fr_320px]">
						<TopConsumersChart
							data={topConsumers.consumers.map((c) => ({
								username: c.username,
								fullName: c.fullName,
								bytes: c.totalBytes,
							}))}
							onConsumerClick={(username) => {
								const match = topConsumers.consumers.find(
									(c) => c.username === username,
								);
								if (match && organizationSlug) {
									navigate({
										to: "/app/$organizationSlug/customers/$customerId",
										params: {
											organizationSlug,
											customerId: match.id,
										},
									});
								}
							}}
						/>
						<div className="space-y-0.5 self-start">
							<div className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-2 pb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
								<span>Customer</span>
								<span className="text-right">↓</span>
								<span className="text-right">↑</span>
							</div>
							{topConsumers.consumers.map((c) => (
								<button
									key={c.id}
									type="button"
									onClick={() => {
										if (!organizationSlug) {
											return;
										}
										navigate({
											to: "/app/$organizationSlug/customers/$customerId",
											params: {
												organizationSlug,
												customerId: c.id,
											},
										});
									}}
									className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-x-4 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent/40"
								>
									<div className="min-w-0">
										<div className="flex items-center gap-1.5 truncate font-medium">
											{/* react-doctor-disable-next-line react-doctor/prefer-tag-over-role -- decorative CSS status dot; <img> is a void element needing a src and cannot render this styled span, so role="img"+aria-label is the right semantic */}
											<span
												role="img"
												className={cn(
													"size-1.5 shrink-0 rounded-full",
													c.online
														? "bg-success"
														: "bg-muted-foreground/30",
												)}
												aria-label={
													c.online
														? "online"
														: "offline"
												}
											/>
											{c.fullName}
										</div>
										<div className="truncate font-mono text-[10px] text-muted-foreground/80">
											{c.username}
										</div>
									</div>
									<span className="font-mono tabular-nums text-right text-muted-foreground">
										{formatBytes(c.downloadBytes)}
									</span>
									<span className="font-mono tabular-nums text-right text-muted-foreground">
										{formatBytes(c.uploadBytes)}
									</span>
								</button>
							))}
						</div>
					</div>
				)}
			</ContentCardSection>
		</ContentCard>
	);
}

function TopConsumersSkeleton() {
	return (
		<ContentCard>
			<div className="flex items-center gap-3 border-b border-border px-4 py-3 md:px-5">
				<Skeleton className="size-4 rounded" />
				<div className="min-w-0 flex-1 space-y-1.5">
					<Skeleton className="h-3.5 w-44" />
					<Skeleton className="h-2.5 w-56" />
				</div>
				<Skeleton className="h-5 w-14" />
			</div>
			<ContentCardSection>
				<div className="grid gap-6 lg:grid-cols-[1fr_320px]">
					<Skeleton className="h-64 w-full" />
					<div className="space-y-2">
						{Array.from({ length: 8 }).map((_, i) => (
							<Skeleton key={i} className="h-7 w-full" />
						))}
					</div>
				</div>
			</ContentCardSection>
		</ContentCard>
	);
}

export function IRadiusControlCenterEmpty() {
	return (
		<ContentCard>
			<ContentCardSection>
				<div className="flex flex-col items-center justify-center py-12 text-center">
					<ActivityIcon className="size-10 text-muted-foreground/60" />
					<h3 className="mt-3 text-base font-medium">
						iRadius is offline
					</h3>
					<p className="mt-1 max-w-md text-sm text-muted-foreground">
						Could not reach the iRadius MySQL through SSH. Check
						credentials in the org's iRadius settings.
					</p>
				</div>
			</ContentCardSection>
		</ContentCard>
	);
}
