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
	fupMode: string | null;
	lastUsageSyncAt: Date | string | null;
}

function toNumber(v: bigint | number | null | undefined): number {
	if (v == null) {
		return 0;
	}
	return typeof v === "bigint" ? Number(v) : v;
}

// iRadius's snapshot excludes customers where `un.Active != 1`, so an offline
// or paused subscriber stops getting fresh stamps and the daily byte fields
// freeze at their last-known value. Anything older than this is treated as
// stale and rendered as a dash — comfortably wider than the worker's 15s tick
// + the 1-minute idle refresh window, so the cell only goes blank when iRadius
// has genuinely stopped reporting this externalId.
const USAGE_STALE_THRESHOLD_MS = 5 * 60 * 1000;

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

/**
 * Compact bandwidth cell for the customers table:
 *  ↓ 1.2 GB   ──┬──   stacked bar visualization
 *  ↑ 320 MB     │
 *
 * The dual mini-bar fills relative to the row's daily total (down + up),
 * not to a global max — so even quiet customers show a visible split.
 * FUP mode is rendered as a small inline pill when the customer is in FUP.
 */
export function UsageCell({
	dailyDown,
	dailyUp,
	totalDown,
	totalUp,
	fupMode,
	lastUsageSyncAt,
}: UsageCellProps) {
	const dl = toNumber(dailyDown);
	const ul = toNumber(dailyUp);
	const total = dl + ul;
	const dlPct = total > 0 ? (dl / total) * 100 : 0;
	const ulPct = total > 0 ? (ul / total) * 100 : 0;
	const fresh = isFresh(lastUsageSyncAt);

	// Live cue: pulse the cell when the customers list query is mid-refetch.
	// The backend's 15s online + usage sync writes fresh bytes; this signals
	// to the user that what they're looking at is being refreshed.
	const isRefreshing =
		useIsFetching({ queryKey: orpc.customers.list.key() }) > 0;

	const isFup =
		!!fupMode &&
		fupMode.toLowerCase() !== "normal" &&
		fupMode.toLowerCase() !== "off";

	// No fresh sample from iRadius → we can't claim this is "today's" usage.
	// Covers the "frozen value because un.Active = 0" case where the local
	// mirror is a stale snapshot from the last full sync, sometimes weeks old.
	if (!fresh || total === 0) {
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

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div
					className={cn(
						"flex w-[120px] flex-col gap-1 transition-opacity",
						isRefreshing && "opacity-60",
					)}
				>
					<div className="flex items-center justify-between gap-2 text-[11px] tabular-nums leading-none">
						<span className="inline-flex items-center gap-0.5 text-info">
							<ArrowDownIcon className="size-2.5" />
							{formatBytes(dl)}
						</span>
						{isFup && (
							<span
								className="inline-flex items-center gap-0.5 rounded bg-warning/12 px-1 py-px text-[9px] font-medium uppercase tracking-wider text-warning"
								title="Fair Use Policy active"
							>
								<ZapIcon className="size-2.5" />
								FUP
							</span>
						)}
					</div>
					<div
						className={cn(
							"flex h-1 w-full overflow-hidden rounded-full bg-muted",
							isRefreshing && "animate-pulse",
						)}
					>
						<div
							className="h-full bg-info transition-all"
							style={{ width: `${dlPct}%` }}
						/>
						<div
							className="h-full bg-chart-4 transition-all"
							style={{ width: `${ulPct}%` }}
						/>
					</div>
					<div className="flex items-center justify-between gap-2 text-[10px] tabular-nums leading-none text-muted-foreground">
						<span className="inline-flex items-center gap-0.5">
							<ArrowUpIcon className="size-2.5" />
							{formatBytes(ul)}
						</span>
					</div>
				</div>
			</TooltipTrigger>
			<TooltipContent side="left" className="text-xs">
				<div className="space-y-1">
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
							{formatBytes(total)}
						</span>
					</div>
					<div className="mt-1.5 border-t border-border pt-1 font-medium">
						Lifetime
					</div>
					<div className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 tabular-nums">
						<span className="text-muted-foreground">↓</span>
						<span>{formatBytes(toNumber(totalDown))}</span>
						<span className="text-muted-foreground">↑</span>
						<span>{formatBytes(toNumber(totalUp))}</span>
					</div>
					{isFup && (
						<div
							className={cn(
								"mt-1.5 inline-flex items-center gap-1 rounded bg-warning/12 px-1.5 py-0.5",
								"text-[10px] font-medium text-warning",
							)}
						>
							<ZapIcon className="size-3" />
							FUP active · {fupMode}
						</div>
					)}
				</div>
			</TooltipContent>
		</Tooltip>
	);
}
