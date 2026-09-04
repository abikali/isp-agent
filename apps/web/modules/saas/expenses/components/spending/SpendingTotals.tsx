"use client";

import { MoneyTile } from "@shared/components/MoneyTile";
import { formatCurrency } from "@shared/lib/format";
import { HourglassIcon, LayersIcon, WalletIcon } from "lucide-react";
import type { SpendingOverview } from "../../hooks/use-spending";

export type SpendingFilter = "all" | "pending" | "unclassified";

interface SpendingTotalsProps {
	totals: SpendingOverview["totals"];
	periodLabel: string;
	filter: SpendingFilter;
	onFilter: (filter: SpendingFilter) => void;
}

/**
 * The three numbers the owner opens this page for. Each is a filter on the
 * rows below so "what?" is one click from "how much?".
 */
export function SpendingTotals({
	totals,
	periodLabel,
	filter,
	onFilter,
}: SpendingTotalsProps) {
	const delta = totals.spent - totals.spentLastMonth;
	const spentLine =
		totals.spentLastMonth > 0
			? `${delta >= 0 ? "Up" : "Down"} ${formatCurrency(Math.abs(delta))} on last month.${totals.direct > 0 ? ` ${formatCurrency(totals.direct)} entered directly.` : ""}`
			: totals.spent > 0
				? `${totals.spentCount} approved lines this month.`
				: "Nothing approved yet this month.";

	const pendingLine =
		totals.pendingCount === 0
			? "No claims waiting. Workers are square."
			: `${totals.pendingCount} ${totals.pendingCount === 1 ? "claim" : "claims"} waiting for a decision.`;

	const unclassifiedLine =
		totals.unclassifiedCount === 0
			? "Every approved line has a bucket."
			: `${totals.unclassifiedCount} approved ${totals.unclassifiedCount === 1 ? "line reads" : "lines read"} as Uncategorised on the P&L.`;

	return (
		<div className="grid gap-4 md:grid-cols-3">
			<MoneyTile
				icon={WalletIcon}
				label={`Spent ${periodLabel.toLowerCase()}`}
				value={totals.spent}
				line={spentLine}
				tone="neutral"
				active={filter === "all"}
				onClick={() => onFilter("all")}
			/>
			<MoneyTile
				icon={HourglassIcon}
				label="Workers waiting to be paid back"
				value={totals.pending}
				line={pendingLine}
				tone={totals.pendingCount > 0 ? "attention" : "good"}
				active={filter === "pending"}
				onClick={() =>
					onFilter(filter === "pending" ? "all" : "pending")
				}
			/>
			<MoneyTile
				icon={LayersIcon}
				label="Needs a bucket"
				value={totals.unclassified}
				line={unclassifiedLine}
				tone={totals.unclassifiedCount > 0 ? "warn" : "good"}
				active={filter === "unclassified"}
				onClick={() =>
					onFilter(filter === "unclassified" ? "all" : "unclassified")
				}
			/>
		</div>
	);
}
