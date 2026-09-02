"use client";

import { formatCurrency } from "@shared/lib/format";
import { Button } from "@ui/components/button";
import { cn } from "@ui/lib";
import {
	BatteryLowIcon,
	HandCoinsIcon,
	MinusIcon,
	PlusIcon,
	WalletCardsIcon,
} from "lucide-react";
import type { DealerFinanceLedger } from "../../hooks/use-dealer-finance";
import { relativeDays } from "../../lib/finance-labels";

interface DealerHeroProps {
	ledger: DealerFinanceLedger;
	lastPaymentAt: Date | string | null;
	chargedThisMonth: number;
	canManage: boolean;
	onRecordPayment: () => void;
	onAddCredit: () => void;
	onDeductCredit: () => void;
}

/**
 * The two balances, side by side, each with the one action that changes it.
 * "Owes you" is a receivable; "credit left" is what they can still spend.
 * They move together on a top-up and apart on a payment — the cards say so.
 */
export function DealerHero({
	ledger,
	lastPaymentAt,
	chargedThisMonth,
	canManage,
	onRecordPayment,
	onAddCredit,
	onDeductCredit,
}: DealerHeroProps) {
	const { owed, prepaid, last12 } = ledger.summary;
	const settled = owed === 0;
	const inCredit = owed < 0;
	const lowCredit =
		chargedThisMonth > 0 ? prepaid < chargedThisMonth * 0.25 : prepaid <= 0;

	return (
		<div className="grid gap-4 md:grid-cols-2">
			<section
				className={cn(
					"rounded-xl border p-5 shadow-xs",
					settled
						? "border-success/30 bg-success/[0.05]"
						: inCredit
							? "border-info/30 bg-info/[0.05]"
							: "border-border bg-card",
				)}
			>
				<div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
					<HandCoinsIcon className="size-3.5" />
					{inCredit ? "In credit with you" : "Owes you"}
				</div>
				<div
					className={cn(
						"mt-2 text-4xl font-medium tabular-nums leading-none tracking-tight",
						settled && "text-success",
						inCredit && "text-info",
					)}
				>
					{settled ? "Settled" : formatCurrency(Math.abs(owed))}
				</div>
				<p className="mt-2 text-sm text-muted-foreground">
					{settled
						? `Nothing outstanding. Last payment ${relativeDays(lastPaymentAt)}.`
						: inCredit
							? "They paid more than the credit they were given. The next top-up uses this first."
							: lastPaymentAt
								? `Last payment ${relativeDays(lastPaymentAt)}. Paid ${formatCurrency(last12.payments)} in the last 12 months.`
								: "Never paid. Everything given so far is still open."}
				</p>
				{canManage && (
					<div className="mt-4 flex flex-wrap gap-2">
						<Button onClick={onRecordPayment}>
							<HandCoinsIcon className="size-4" />
							Record payment
						</Button>
					</div>
				)}
			</section>

			<section
				className={cn(
					"rounded-xl border p-5 shadow-xs",
					lowCredit
						? "border-warning/30 bg-warning/[0.05]"
						: "border-border bg-card",
				)}
			>
				<div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
					{lowCredit ? (
						<BatteryLowIcon className="size-3.5 text-warning" />
					) : (
						<WalletCardsIcon className="size-3.5" />
					)}
					Credit left to spend
				</div>
				<div
					className={cn(
						"mt-2 text-4xl font-medium tabular-nums leading-none tracking-tight",
						lowCredit && "text-warning",
					)}
				>
					{formatCurrency(prepaid)}
				</div>
				<p className="mt-2 text-sm text-muted-foreground">
					{chargedThisMonth > 0
						? `Used ${formatCurrency(chargedThisMonth)} on renewals this month.${lowCredit ? " Running low — renewals will fail at zero." : ""}`
						: "Nothing charged yet this month."}
				</p>
				{canManage && (
					<div className="mt-4 flex flex-wrap gap-2">
						<Button variant="outline" onClick={onAddCredit}>
							<PlusIcon className="size-4" />
							Add credit
						</Button>
						<Button
							variant="ghost"
							onClick={onDeductCredit}
							disabled={prepaid <= 0}
						>
							<MinusIcon className="size-4" />
							Deduct
						</Button>
					</div>
				)}
			</section>
		</div>
	);
}
