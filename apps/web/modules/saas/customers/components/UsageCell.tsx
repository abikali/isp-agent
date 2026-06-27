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
import { ArrowDownIcon, ArrowUpIcon, ZapIcon } from "lucide-react";

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
	// iRadius auto-fallback caps (MB) for "UP TO X" plans that carry no explicit
	// quota column — the data volume after which the subscriber is throttled.
	// Lowest step, mirrored from AccountType{Daily,Monthly}AutoFallBack.AboveMB.
	dailyFallbackMb: number | null;
	monthlyFallbackMb: number | null;
	reachMaxQuota: boolean;
	lastUsageSyncAt: Date | string | null;
}

const MB = 1024 ** 2;

// iRadius's snapshot excludes customers where `un.Active != 1`, so an offline
// or paused subscriber stops getting fresh stamps and the daily byte fields
// freeze at their last-known value. Anything older than this is treated as
// stale and rendered as a dash.
const USAGE_STALE_THRESHOLD_MS = 5 * 60 * 1000;

// Fallback daily allocation shown for plans that don't carry any iRadius
// quota fields (the "UP TO 20M" speed-only plans). Mirrors iRadius's own
// QDAY column which displays `X / 5000 MB` for these subscribers, so the
// cell always shows an "out-of-how-much" denominator. Promote to an org-
// level setting if collectors ever need different defaults per tenant.
const DEFAULT_DAILY_ALLOCATION_MB = 5000;

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
 *   3. Daily auto-fallback cap (plan.dailyFallbackMb) — "UP TO X" plans store
 *      their quota as a throttle step, not a quota column.
 *   4. Monthly auto-fallback cap (plan.monthlyFallbackMb) — rare monthly variant.
 *   5. Default daily allocation — no quota anywhere on the plan.
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
	dailyFallbackMb,
	monthlyFallbackMb,
	reachMaxQuota,
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

	// iRadius's `FupMode` is a static config flag attached to plans that
	// have a FUP policy — ~600 rows in prod carry it, and none of them
	// have reachMaxQuota=true. It does NOT indicate the customer is
	// currently being throttled, so don't drive a "FUP active" badge from
	// it. `reachMaxQuota` is the runtime signal iRadius bumps when a
	// subscriber actually crosses their quota — that's the only honest
	// source for an "in FUP" warning.

	// Resolve the active quota view. Preference: plan.monthlyQuota → plan daily
	// quota fields → daily auto-fallback cap → monthly auto-fallback cap →
	// default daily allocation. The fallback caps cover "UP TO X" plans whose
	// quota is a throttle step rather than a quota column; the default keeps the
	// cell visually consistent for plans with no quota at all.
	let quotaScope: "monthly" | "daily" = "daily";
	let quotaUsed = todayTotal;
	let quotaLimit = DEFAULT_DAILY_ALLOCATION_MB * MB;
	let quotaIsDefault = true;
	if (monthlyQuotaMb && monthlyQuotaMb > 0) {
		quotaScope = "monthly";
		quotaUsed = cycleTotal;
		quotaLimit = monthlyQuotaMb * MB;
		quotaIsDefault = false;
	} else {
		const dailyLimitMb =
			combinedDailyQuotaMb ??
			(dailyQuotaDownMb != null || dailyQuotaUpMb != null
				? (dailyQuotaDownMb ?? 0) + (dailyQuotaUpMb ?? 0)
				: null);
		if (dailyLimitMb && dailyLimitMb > 0) {
			quotaLimit = dailyLimitMb * MB;
			quotaIsDefault = false;
		} else if (dailyFallbackMb && dailyFallbackMb > 0) {
			quotaLimit = dailyFallbackMb * MB;
			quotaIsDefault = false;
		} else if (monthlyFallbackMb && monthlyFallbackMb > 0) {
			quotaScope = "monthly";
			quotaUsed = cycleTotal;
			quotaLimit = monthlyFallbackMb * MB;
			quotaIsDefault = false;
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
		quotaLimit > 0 ? Math.min(100, (quotaUsed / quotaLimit) * 100) : 0;
	const tier = tierFor(quotaPct, reachMaxQuota);

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
									title="In FUP · iRadius reachMaxQuota flag"
								>
									<ZapIcon className="size-2.5" />
									FUP
								</span>
							)}
						</span>
					</div>
					{/* react-doctor-disable-next-line react-doctor/prefer-tag-over-role -- custom styled bar with a nested animated fill child; native <progress> is a replaced element and cannot render the styled inner fill */}
					<div
						role="progressbar"
						aria-valuenow={Math.round(quotaPct)}
						aria-valuemin={0}
						aria-valuemax={100}
						aria-label={`${quotaScope === "monthly" ? "Monthly" : "Daily"} quota: ${formatBytes(quotaUsed)} of ${formatBytes(quotaLimit)}${quotaIsDefault ? " (default allocation)" : ""}`}
						className={cn(
							"relative h-[18px] w-full overflow-hidden rounded-sm border border-border/40",
							TIER_TRACK_CLASS[tier],
							quotaIsDefault && "border-dashed",
							isRefreshing && "animate-pulse",
						)}
						title={
							quotaIsDefault
								? `Plan has no quota in iRadius — falling back to default daily allocation of ${DEFAULT_DAILY_ALLOCATION_MB} MB.`
								: undefined
						}
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
									{quotaIsDefault ? "Allocation" : "Quota"}
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
									{quotaIsDefault && (
										<span className="ml-1 text-[10px] font-normal text-muted-foreground">
											· default
										</span>
									)}
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
					{reachMaxQuota && (
						<div className="border-t border-border pt-1">
							<div className="inline-flex items-center gap-1 rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
								<ZapIcon className="size-3" />
								In FUP · reached max quota
							</div>
						</div>
					)}
				</div>
			</TooltipContent>
		</Tooltip>
	);
}
