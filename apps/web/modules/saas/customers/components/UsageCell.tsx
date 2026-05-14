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
	monthlyQuotaGb: number | null;
	dailyQuotaDownGb: number | null;
	dailyQuotaUpGb: number | null;
	combinedDailyQuotaGb: number | null;
	reachMaxQuota: boolean;
	fupMode: string | null;
	lastUsageSyncAt: Date | string | null;
}

const GB = 1024 ** 3;

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

const TIER_BAR_CLASS: Record<QuotaTier, string> = {
	ok: "bg-success",
	warn: "bg-warning",
	danger: "bg-destructive",
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
	monthlyQuotaGb,
	dailyQuotaDownGb,
	dailyQuotaUpGb,
	combinedDailyQuotaGb,
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

	if (!fresh || todayTotal === 0) {
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

	// Resolve the active quota view. The helper above returns scope; we
	// compute used/limit/pct here so totals aren't duplicated across files.
	let quotaScope: "monthly" | "daily" | null = null;
	let quotaUsed = 0;
	let quotaLimit = 0;
	if (monthlyQuotaGb && monthlyQuotaGb > 0) {
		quotaScope = "monthly";
		quotaUsed = cycleTotal;
		quotaLimit = monthlyQuotaGb * GB;
	} else {
		const dailyLimitGb =
			combinedDailyQuotaGb ??
			(dailyQuotaDownGb != null || dailyQuotaUpGb != null
				? (dailyQuotaDownGb ?? 0) + (dailyQuotaUpGb ?? 0)
				: null);
		if (dailyLimitGb && dailyLimitGb > 0) {
			quotaScope = "daily";
			quotaUsed = todayTotal;
			quotaLimit = dailyLimitGb * GB;
		}
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
						"flex w-[140px] flex-col gap-1 transition-opacity",
						isRefreshing && "opacity-60",
					)}
				>
					<div className="flex items-center justify-between gap-1 text-[11px] tabular-nums leading-none">
						<span className="inline-flex items-center gap-1 truncate">
							<span className="inline-flex items-center gap-0.5 text-info">
								<ArrowDownIcon className="size-2.5" />
								{formatBytes(dl)}
							</span>
							<span className="text-muted-foreground">·</span>
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
						<div className="flex items-center gap-1.5">
							<div
								className={cn(
									"h-1.5 flex-1 overflow-hidden rounded-full bg-muted",
									isRefreshing && "animate-pulse",
								)}
							>
								<div
									className={cn(
										"h-full transition-all",
										TIER_BAR_CLASS[tier],
									)}
									style={{ width: `${quotaPct}%` }}
								/>
							</div>
							<span
								className={cn(
									"text-[9px] font-medium tabular-nums leading-none",
									TIER_LABEL_CLASS[tier],
								)}
							>
								{Math.round(quotaPct)}%
								<span className="ml-0.5 uppercase opacity-60">
									{quotaScope === "monthly" ? "mo" : "d"}
								</span>
							</span>
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
					{monthlyQuotaGb && monthlyQuotaGb > 0 && (
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
