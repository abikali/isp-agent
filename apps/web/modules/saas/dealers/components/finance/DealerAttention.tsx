"use client";

import { formatCurrency } from "@shared/lib/format";
import { Link } from "@tanstack/react-router";
import { Button } from "@ui/components/button";
import { cn } from "@ui/lib";
import { AlertTriangleIcon, BatteryLowIcon, HandCoinsIcon } from "lucide-react";
import type { DealerFinanceRow } from "../../hooks/use-dealer-finance";
import { daysSince, relativeDays } from "../../lib/finance-labels";

interface DealerAttentionProps {
	dealers: DealerFinanceRow[];
	slug: string;
	canManage: boolean;
	onRecordPayment: (dealer: DealerFinanceRow) => void;
	onAddCredit: (dealer: DealerFinanceRow) => void;
}

/** A debt older than this with no payment is flagged, whatever its size. */
const STALE_DEBT_DAYS = 45;

/**
 * What needs a phone call today. Two situations only — money that has been
 * sitting too long, and a dealer whose subscribers are about to stop renewing
 * because their credit is gone. Anything else lives in the table.
 */
export function DealerAttention({
	dealers,
	slug,
	canManage,
	onRecordPayment,
	onAddCredit,
}: DealerAttentionProps) {
	const debts: Array<{ dealer: DealerFinanceRow; age: number }> = [];
	for (const dealer of dealers) {
		const age = daysSince(dealer.lastTopUpAt) ?? 0;
		if (
			dealer.owed > 0 &&
			(age >= STALE_DEBT_DAYS || dealer.owed >= 2000)
		) {
			debts.push({ dealer, age });
		}
	}
	debts.sort((a, b) => b.dealer.owed - a.dealer.owed).splice(4);

	const low = dealers
		.filter((d) => d.lowCredit)
		.sort((a, b) => a.prepaid - b.prepaid)
		.slice(0, 4);

	if (debts.length === 0 && low.length === 0) {
		return null;
	}

	return (
		<section className="rounded-xl border border-warning/30 bg-warning/[0.05] p-4 md:p-5">
			<div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-warning">
				<AlertTriangleIcon className="size-3.5" />
				Needs a look
			</div>
			<ul className="mt-3 grid gap-2 md:grid-cols-2">
				{debts.map(({ dealer, age }) => (
					<AttentionItem
						key={`debt-${dealer.id}`}
						icon={HandCoinsIcon}
						to={`/app/${slug}/dealers/${dealer.id}`}
						title={dealer.name}
						amount={dealer.owed}
						line={
							dealer.lastPaymentAt
								? `Last paid ${relativeDays(dealer.lastPaymentAt)} · credit given ${age} days ago`
								: `Never paid · credit given ${age} days ago`
						}
						action={
							canManage ? (
								<Button
									size="sm"
									variant="outline"
									onClick={() => onRecordPayment(dealer)}
								>
									Record payment
								</Button>
							) : null
						}
					/>
				))}
				{low.map((dealer) => (
					<AttentionItem
						key={`low-${dealer.id}`}
						icon={BatteryLowIcon}
						to={`/app/${slug}/dealers/${dealer.id}`}
						title={dealer.name}
						amount={dealer.prepaid}
						amountLabel="credit left"
						line={
							dealer.chargedLastMonth > 0
								? `Used ${formatCurrency(dealer.chargedLastMonth)} last month — renewals will start failing.`
								: `Below the ${formatCurrency(dealer.warnAt)} warning level set in iRadius.`
						}
						action={
							canManage ? (
								<Button
									size="sm"
									variant="outline"
									onClick={() => onAddCredit(dealer)}
								>
									Add credit
								</Button>
							) : null
						}
					/>
				))}
			</ul>
		</section>
	);
}

interface AttentionItemProps {
	icon: typeof HandCoinsIcon;
	to: string;
	title: string;
	amount: number;
	amountLabel?: string;
	line: string;
	action: React.ReactNode;
}

function AttentionItem({
	icon: Icon,
	to,
	title,
	amount,
	amountLabel,
	line,
	action,
}: AttentionItemProps) {
	return (
		<li className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
			<div
				className={cn(
					"flex size-8 shrink-0 items-center justify-center rounded-md bg-warning/12 text-warning",
				)}
			>
				<Icon className="size-4" />
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex items-baseline gap-2">
					<Link
						to={to}
						className="truncate text-sm font-medium hover:underline"
					>
						{title}
					</Link>
					<span className="shrink-0 text-sm font-medium tabular-nums">
						{formatCurrency(amount)}
						{amountLabel && (
							<span className="ml-1 text-xs font-normal text-muted-foreground">
								{amountLabel}
							</span>
						)}
					</span>
				</div>
				<p className="truncate text-xs text-muted-foreground">{line}</p>
			</div>
			{action && <div className="shrink-0">{action}</div>}
		</li>
	);
}
