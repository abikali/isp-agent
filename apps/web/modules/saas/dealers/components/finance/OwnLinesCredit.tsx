"use client";

import { formatCurrency } from "@shared/lib/format";
import { cn } from "@ui/lib";
import { BatteryLowIcon, WalletIcon } from "lucide-react";
import type { DealerFinanceOverview } from "../../hooks/use-dealer-finance";

type OwnLine = DealerFinanceOverview["ownLines"][number];

/**
 * Prepaid iRadius credit on the operator's own dealer accounts — the main line
 * and its internal lines (LIBANCOM-FIBER). They aren't resellers, so they stay
 * off the dealer list, but every new subscriber and renewal on them still
 * spends this credit, and a charge it can't cover leaves an approved
 * subscriber unbilled. Topped up in iRadius.
 */
export function OwnLinesCredit({ lines }: { lines: OwnLine[] }) {
	if (lines.length === 0) {
		return null;
	}
	const anyLow = lines.some((line) => line.lowCredit);

	return (
		<section
			className={cn(
				"rounded-xl border p-4 md:p-5",
				anyLow
					? "border-warning/30 bg-warning/[0.05]"
					: "border-border bg-card",
			)}
		>
			<div
				className={cn(
					"flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider",
					anyLow ? "text-warning" : "text-muted-foreground",
				)}
			>
				<WalletIcon className="size-3.5" />
				Our own lines — credit left
			</div>
			<ul className="mt-3 grid gap-2 md:grid-cols-2">
				{lines.map((line) => (
					<li
						key={line.id}
						className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
					>
						<div
							className={cn(
								"flex size-8 shrink-0 items-center justify-center rounded-md",
								line.lowCredit
									? "bg-warning/12 text-warning"
									: "bg-muted text-muted-foreground",
							)}
						>
							{line.lowCredit ? (
								<BatteryLowIcon className="size-4" />
							) : (
								<WalletIcon className="size-4" />
							)}
						</div>
						<div className="min-w-0 flex-1">
							<div className="flex items-baseline gap-2">
								<span className="truncate text-sm font-medium">
									{line.name}
								</span>
								<span className="shrink-0 text-sm font-medium tabular-nums">
									{formatCurrency(line.prepaid)}
								</span>
							</div>
							<p className="truncate text-xs text-muted-foreground">
								{ownLineStatus(line)}
							</p>
						</div>
					</li>
				))}
			</ul>
		</section>
	);
}

function ownLineStatus(line: OwnLine): string {
	const kind = line.isInternalLine ? "Internal line" : "Main line";
	if (line.noCharge) {
		return `${kind} · not charged in iRadius`;
	}
	const left =
		line.chargesLeft !== null
			? ` · about ${line.chargesLeft} charges left`
			: "";
	if (line.lowCredit) {
		return `${kind}${left} — top up in iRadius before new subscribers go unbilled`;
	}
	return `${kind}${left}`;
}
