"use client";

import { MoneyTile } from "@shared/components/MoneyTile";
import {
	BatteryLowIcon,
	FlameIcon,
	HandCoinsIcon,
	WalletCardsIcon,
} from "lucide-react";
import type { DealerFinanceOverview } from "../../hooks/use-dealer-finance";

export type DealerFilter = "all" | "owing" | "low" | "settled";

interface DealerTotalsProps {
	totals: DealerFinanceOverview["totals"];
	periodLabel: string;
	isOperator: boolean;
	filter: DealerFilter;
	onFilter: (filter: DealerFilter) => void;
}

/**
 * The three numbers the owner opens this page for, each one a filter on the
 * table below so "who?" is one click from "how much?".
 */
export function DealerTotals({
	totals,
	periodLabel,
	isOperator,
	filter,
	onFilter,
}: DealerTotalsProps) {
	const owingLine = isOperator
		? totals.owingCount === 0
			? "Every dealer is settled."
			: `${totals.owingCount} of ${totals.dealerCount} dealers have an open balance.`
		: totals.owed > 0
			? "Credit you were given and have not paid for yet."
			: "You are fully settled with the operator.";

	const lowLine = isOperator
		? totals.lowCreditCount === 0
			? "Nobody is close to running out."
			: `${totals.lowCreditCount} ${totals.lowCreditCount === 1 ? "dealer is" : "dealers are"} about to run out.`
		: "Credit still available for renewals.";

	return (
		<div className="grid gap-4 md:grid-cols-3">
			<MoneyTile
				icon={HandCoinsIcon}
				label={isOperator ? "Dealers owe you" : "You owe the operator"}
				value={totals.owed}
				line={owingLine}
				tone={totals.owed > 0 ? "attention" : "good"}
				active={filter === "owing"}
				onClick={() => onFilter(filter === "owing" ? "all" : "owing")}
			/>
			<MoneyTile
				icon={
					totals.lowCreditCount > 0 ? BatteryLowIcon : WalletCardsIcon
				}
				label={
					isOperator
						? "Prepaid credit outstanding"
						: "Your prepaid credit"
				}
				value={totals.prepaid}
				line={lowLine}
				tone={totals.lowCreditCount > 0 ? "warn" : "neutral"}
				active={filter === "low"}
				onClick={() => onFilter(filter === "low" ? "all" : "low")}
			/>
			<MoneyTile
				icon={FlameIcon}
				label={`Charged ${periodLabel.toLowerCase()}`}
				value={totals.chargedThisMonth}
				line={
					isOperator
						? "Renewals and new lines dealers paid for with their credit."
						: "Renewals and new lines paid from your credit."
				}
				tone="neutral"
			/>
		</div>
	);
}
