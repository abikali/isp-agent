"use client";

import { formatBytes } from "@shared/components/charts/chart-utils";
import { orpc } from "@shared/lib/orpc";
import { useIsFetching } from "@tanstack/react-query";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@ui/components/tooltip";
import { cn } from "@ui/lib";
import {
	ArrowDownIcon,
	ArrowUpIcon,
	ShieldAlertIcon,
	ZapIcon,
} from "lucide-react";

interface UsageCellProps {
	dailyDown: number;
	dailyUp: number;
	totalDown: number;
	totalUp: number;
	cycleStartDown: number;
	cycleStartUp: number;
	cycleStartedAt: Date | string | null;
	// Plan quotas as iRadius stores them — values are MB (not GB, despite the
	// historical comment on `ServicePlan.monthlyQuota`). iRadius's
	// `AccountType.CombinedMaxMonthlyUpAndDown` and the daily counterparts are
	// all in MB; the value 700000 on a plan named "CEH2-7M-700G" reads as
	// 700,000 MB ≈ 684 GB.
	monthlyQuotaMb: number | null;
	dailyQuotaDownMb: number | null;
	dailyQuotaUpMb: number | null;
	combinedDailyQuotaMb: number | null;
	reachMaxQuota: boolean;
	fupMode: string | null;
	lastUsageSyncAt: Date | string | null;
}

const MB = 1024 ** 2;

// iRadius's snapshot excludes customers where `un.Active != 1`, so an offline
// or paused subscriber stops getting fresh stamps and the daily byte fields
// freeze at their last-known value. Anything older than this is treated as
// stale and rendered as a dash.
const USAGE_STALE_THRESHOLD_MS = 5 * 60 * 1000;

function toNumber(v: bigint | number | null | undefined): number {
	if (v == null) {
		return 0;
	}
	return typeof v === "bigint" ? Number(v) : v;
}

function isFresh(lastUsageSyncAt: Date | string | null): boolean {
	if (!lastUsageSyncAt) {
		return false;
	}
	const ts =
		typeof lastUsageSyncAt === "string"
			? new Date(lastUsageSyncAt).getTime()
			: lastUsageSyncAt.getTime();
	if (Number.isNaN(ts)) {
		return false;
	}
	return Date.now() - ts < USAGE_STALE_THRESHOLD_MS;
}

type QuotaTier = "ok" | "warn" | "danger";

function tierFor(pct: number, hardCap: boolean): QuotaTier {
	if (hardCap || pct >= 85) {
		return "danger";
	}
	if (pct >= 60) {
		return "warn";
	}
	return "ok";
}

// Bar fill (the "used" portion) — saturated colour that grows across a
// muted same-hue track. Matches iRadius's QDAY column visually: a green
// rail filling up red as quota is consumed.
const TIER_BAR_CLASS: Record<QuotaTier, string> = {
	ok: "bg-success/80",
	warn: "bg-warning/80",
	danger: "bg-destructive/80",
};

// Bar track ("remaining" tint) — softer of the same hue family so the
// fill stays readable when the bar is mostly empty.
const TIER_TRACK_CLASS: Record<QuotaTier, string> = {
	ok: "bg-success/15",
	warn: "bg-warning/15",
	danger: "bg-destructive/15",
};

const TIER_LABEL_CLASS: Record<QuotaTier, string> = {
	ok: "text-muted-foreground",
	warn: "text-warning",
	danger: "text-destructive",
};

/**
 * Compact bandwidth + quota cell for the customers table.
 *
 * Layout:
 *   ↓ 831 MB · ↑ 36 MB        [FUP] [MAX]
 *   [████████░░░░░░░░░░░░░] 24% · mo
 *
 * The bar represents quota utilisation. Preference order:
 *   1. Monthly cycle (downloadBytes − cycleStartDownloadBytes) / plan.monthlyQuota
 *   2. Daily combined (dailyDown + dailyUp) / plan.combinedMaxUpAndDown
 *      (or dailyQuotaDown + dailyQuotaUp)
 *   3. Down/up split — no quota on the plan, fall back to showing the daily
 *      composition like the legacy cell.
 *
 * Stale samples (no recent iRadius snapshot) render as "—" so frozen values
 * from old syncs aren't mislabelled "today".
 */
export function UsageCell({
	dailyDown,
	dailyUp,
	totalDown,
	totalUp,
	cycleStartDown,
	cycleStartUp,
	cycleStartedAt,
	monthlyQuotaMb,
	dailyQuotaDownMb,
	dailyQuotaUpMb,
	combinedDailyQuotaMb,
	reachMaxQuota,
	fupMode,
	lastUsageSyncAt,
}: UsageCellProps) {
	const dl = toNumber(dailyDown);
	const ul = toNumber(dailyUp);
	const lifetimeDl = toNumber(totalDown);
	const lifetimeUl = toNumber(totalUp);
	const cycleDl = Math.max(0, lifetimeDl - toNumber(cycleStartDown));
	const cycleUl = Math.max(0, lifetimeUl - toNumber(cycleStartUp));
	const cycleTotal = cycleDl + cycleUl;
	const todayTotal = dl + ul;
	const fresh = isFresh(lastUsageSyncAt);

	const isRefreshing =
		useIsFetching({ queryKey: orpc.customers.list.key() }) > 0;

	const isFup =
		!!fupMode &&
		fupMode.toLowerCase() !== "normal" &&
		fupMode.toLowerCase() !== "off";

	// Resolve the active quota view first — if the plan has a quota, the
	// progress bar is worth showing even on days the customer hasn't moved
	// bytes (a 700 GB plan at 24% mid-cycle is meaningful at 6 a.m.).
	let quotaScope: "monthly" | "daily" | null = null;
	let quotaUsed = 0;
	let quotaLimit = 0;
	if (monthlyQuotaMb && monthlyQuotaMb > 0) {
		quotaScope = "monthly";
		quotaUsed = cycleTotal;
		quotaLimit = monthlyQuotaMb * MB;
	} else {
		const dailyLimitMb =
			combinedDailyQuotaMb ??
			(dailyQuotaDownMb != null || dailyQuotaUpMb != null
				? (dailyQuotaDownMb ?? 0) + (dailyQuotaUpMb ?? 0)
				: null);
		if (dailyLimitMb && dailyLimitMb > 0) {
			quotaScope = "daily";
			quotaUsed = todayTotal;
			quotaLimit = dailyLimitMb * MB;
		}
	}

	// Only fall back to a dash when iRadius isn't currently reporting on this
	// customer. A fresh sample at 0 B is still meaningful — "online, no usage
	// yet today" — and worth rendering as 0 B / 0 B rather than swallowing.
	if (!fresh) {
		return (
			<span
				className={cn(
					"text-muted-foreground",
					isRefreshing && "animate-pulse",
				)}
				title={
					lastUsageSyncAt
						? `Last sample: ${new Date(lastUsageSyncAt).toLocaleString()}`
						: "No recent sample from iRadius"
				}
			>
				—
			</span>
		);
	}

	const quotaPct =
		quotaScope && quotaLimit > 0
			? Math.min(100, (quotaUsed / quotaLimit) * 100)
			: 0;
	const tier = tierFor(quotaPct, reachMaxQuota || isFup);
	const splitDlPct = todayTotal > 0 ? (dl / todayTotal) * 100 : 0;
	const splitUlPct = todayTotal > 0 ? (ul / todayTotal) * 100 : 0;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div
					className={cn(
						"flex w-[170px] flex-col gap-1 transition-opacity",
						isRefreshing && "opacity-60",
					)}
				>
					<div className="flex items-center justify-between gap-1 text-[10px] tabular-nums leading-none">
						<span className="inline-flex items-center gap-1 truncate text-muted-foreground">
							<span className="inline-flex items-center gap-0.5 text-info">
								<ArrowDownIcon className="size-2.5" />
								{formatBytes(dl)}
							</span>
							<span>·</span>
							<span className="inline-flex items-center gap-0.5 text-chart-4">
								<ArrowUpIcon className="size-2.5" />
								{formatBytes(ul)}
							</span>
						</span>
						<span className="inline-flex shrink-0 items-center gap-0.5">
							{reachMaxQuota && (
								<span
									className="inline-flex items-center gap-0.5 rounded bg-destructive/15 px-1 py-px text-[9px] font-semibold uppercase tracking-wider text-destructive"
									title="iRadius flag: reachMaxQuota"
								>
									<ShieldAlertIcon className="size-2.5" />
									MAX
								</span>
							)}
							{isFup && (
								<span
									className="inline-flex items-center gap-0.5 rounded bg-warning/12 px-1 py-px text-[9px] font-semibold uppercase tracking-wider text-warning"
									title={`FUP active · ${fupMode}`}
								>
									<ZapIcon className="size-2.5" />
									FUP
								</span>
							)}
						</span>
					</div>
					{quotaScope ? (
						<div
							role="progressbar"
							aria-valuenow={Math.round(quotaPct)}
							aria-valuemin={0}
							aria-valuemax={100}
							aria-label={`${quotaScope === "monthly" ? "Monthly" : "Daily"} quota: ${formatBytes(quotaUsed)} of ${formatBytes(quotaLimit)}`}
							className={cn(
								"relative h-[18px] w-full overflow-hidden rounded-sm border border-border/40",
								TIER_TRACK_CLASS[tier],
								isRefreshing && "animate-pulse",
							)}
						>
							<div
								className={cn(
									"absolute inset-y-0 left-0 transition-all",
									TIER_BAR_CLASS[tier],
								)}
								style={{ width: `${quotaPct}%` }}
							/>
							<div className="absolute inset-0 flex items-center justify-center gap-1 px-1 text-[10px] font-medium tabular-nums leading-none text-foreground">
								<span>{formatBytes(quotaUsed)}</span>
								<span className="opacity-50">/</span>
								<span>{formatBytes(quotaLimit)}</span>
								<span className="ml-0.5 text-[9px] uppercase opacity-50">
									{quotaScope === "monthly" ? "mo" : "d"}
								</span>
							</div>
						</div>
					) : (
						<div
							className={cn(
								"flex h-1.5 w-full overflow-hidden rounded-full bg-muted",
								isRefreshing && "animate-pulse",
							)}
							title="No quota configured on plan — showing today's download/upload split"
						>
							<div
								className="h-full bg-info transition-all"
								style={{ width: `${splitDlPct}%` }}
							/>
							<div
								className="h-full bg-chart-4 transition-all"
								style={{ width: `${splitUlPct}%` }}
							/>
						</div>
					)}
				</div>
			</TooltipTrigger>
			<TooltipContent side="left" className="text-xs">
				<div className="space-y-1.5">
					<div className="font-medium">Today</div>
					<div className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 tabular-nums">
						<span className="text-muted-foreground">
							↓ Download
						</span>
						<span>{formatBytes(dl)}</span>
						<span className="text-muted-foreground">↑ Upload</span>
						<span>{formatBytes(ul)}</span>
						<span className="text-muted-foreground">Total</span>
						<span className="font-medium">
							{formatBytes(todayTotal)}
						</span>
						{quotaScope === "daily" && (
							<>
								<span className="text-muted-foreground">
									Quota
								</span>
								<span className="font-medium">
									{formatBytes(quotaLimit)}{" "}
									<span
										className={cn(
											"font-normal",
											TIER_LABEL_CLASS[tier],
										)}
									>
										({Math.round(quotaPct)}%)
									</span>
								</span>
							</>
						)}
					</div>
					{monthlyQuotaMb && monthlyQuotaMb > 0 && (
						<>
							<div className="border-t border-border pt-1 font-medium">
								This cycle
								{cycleStartedAt && (
									<span className="ml-1 text-[10px] font-normal text-muted-foreground">
										since{" "}
										{new Date(
											cycleStartedAt,
										).toLocaleDateString()}
									</span>
								)}
							</div>
							<div className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 tabular-nums">
								<span className="text-muted-foreground">↓</span>
								<span>{formatBytes(cycleDl)}</span>
								<span className="text-muted-foreground">↑</span>
								<span>{formatBytes(cycleUl)}</span>
								<span className="text-muted-foreground">
									Used
								</span>
								<span className="font-medium">
									{formatBytes(cycleTotal)}
								</span>
								<span className="text-muted-foreground">
									Quota
								</span>
								<span className="font-medium">
									{formatBytes(quotaLimit)}{" "}
									<span
										className={cn(
											"font-normal",
											TIER_LABEL_CLASS[tier],
										)}
									>
										({Math.round(quotaPct)}%)
									</span>
								</span>
							</div>
						</>
					)}
					<div className="border-t border-border pt-1 font-medium">
						Lifetime
					</div>
					<div className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 tabular-nums">
						<span className="text-muted-foreground">↓</span>
						<span>{formatBytes(lifetimeDl)}</span>
						<span className="text-muted-foreground">↑</span>
						<span>{formatBytes(lifetimeUl)}</span>
					</div>
					{(isFup || reachMaxQuota) && (
						<div className="border-t border-border pt-1">
							{reachMaxQuota && (
								<div className="inline-flex items-center gap-1 rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
									<ShieldAlertIcon className="size-3" />
									Reached max quota
								</div>
							)}
							{isFup && (
								<div
									className={cn(
										"mt-1 inline-flex items-center gap-1 rounded bg-warning/12 px-1.5 py-0.5",
										"text-[10px] font-medium text-warning",
									)}
								>
									<ZapIcon className="size-3" />
									FUP active · {fupMode}
								</div>
							)}
						</div>
					)}
				</div>
			</TooltipContent>
		</Tooltip>
	);
}
