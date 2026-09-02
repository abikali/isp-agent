"use client";

import {
	ContentCard,
	ContentCardSection,
} from "@shared/components/ContentCard";
import { formatCurrency, formatDate } from "@shared/lib/format";
import { cn } from "@ui/lib";
import type { DealerFinanceLedger } from "../../hooks/use-dealer-finance";

interface DealerActivityProps {
	activity: DealerFinanceLedger["activity"];
	summary: DealerFinanceLedger["summary"];
	customersCount: number;
}

const CHARGE_LABELS: Record<string, string> = {
	RENEW: "Renewal",
	"NEW USER": "New line",
	"CHANGE ACCOUNT": "Plan change",
	"ADD EXTRA TIME": "Extra time",
	"RESET FUP": "FUP reset",
	"ADD EXTRA GB": "Extra data",
	REFUND: "Refund",
	"SEND SMS": "SMS",
	"TRANSFER COMMISSION": "Commission",
};

/**
 * What the dealer is doing with the credit: six months of consumption as
 * bars, the last twelve months in and out, and the most recent charges.
 * This is the context for "should I give them more?".
 */
export function DealerActivity({
	activity,
	summary,
	customersCount,
}: DealerActivityProps) {
	const max = Math.max(...activity.months.map((m) => m.charged), 1);
	const { last12 } = summary;

	return (
		<ContentCard>
			<ContentCardSection className="border-b border-border">
				<div className="text-sm font-medium">Credit used, by month</div>
				<p className="mt-0.5 text-xs text-muted-foreground">
					Renewals, new lines and plan changes paid from their credit.
					{customersCount > 0 && ` ${customersCount} subscribers.`}
				</p>
				<div className="mt-4 flex h-28 items-end gap-2">
					{activity.months.map((m) => (
						<div
							key={`${m.year}-${m.month}`}
							className="flex flex-1 flex-col items-center gap-1"
							title={`${m.label}: ${formatCurrency(m.charged)} across ${m.count} charges`}
						>
							<span className="text-[10px] tabular-nums text-muted-foreground">
								{m.charged > 0 ? formatCurrency(m.charged) : ""}
							</span>
							<div className="flex h-20 w-full items-end">
								<div
									className={cn(
										"w-full rounded-t-sm bg-chart-3/80",
										m.charged === 0 && "bg-muted",
									)}
									style={{
										height: `${Math.max((m.charged / max) * 100, m.charged > 0 ? 6 : 2)}%`,
									}}
								/>
							</div>
							<span className="text-[10px] text-muted-foreground">
								{m.label}
							</span>
						</div>
					))}
				</div>
			</ContentCardSection>

			<ContentCardSection className="border-b border-border">
				<div className="text-sm font-medium">Last 12 months</div>
				<dl className="mt-2 space-y-1.5 text-sm">
					<Row label="Credit you gave" value={last12.topUps} />
					<Row
						label="They paid you"
						value={last12.payments}
						tone="good"
					/>
					{last12.writeOffs > 0 && (
						<Row
							label="You wrote off"
							value={last12.writeOffs}
							tone="warn"
						/>
					)}
					{last12.deductions > 0 && (
						<Row
							label="Credit taken back"
							value={last12.deductions}
						/>
					)}
				</dl>
			</ContentCardSection>

			<ContentCardSection padded={false}>
				<div className="px-4 pt-4 text-sm font-medium">
					Recent charges
				</div>
				{activity.recentCharges.length === 0 ? (
					<p className="px-4 py-4 text-sm text-muted-foreground">
						No charges in the last six months.
					</p>
				) : (
					<ul className="mt-2">
						{activity.recentCharges.slice(0, 8).map((c) => (
							<li
								key={c.id}
								className="flex items-center gap-3 border-t border-border px-4 py-2 text-sm"
							>
								<div className="min-w-0 flex-1">
									<div className="truncate">
										{CHARGE_LABELS[c.type] ?? c.type}
									</div>
									<div className="truncate text-xs text-muted-foreground">
										{formatDate(c.operationDate, {
											dateStyle: "medium",
										})}
										{c.description && ` · ${c.description}`}
									</div>
								</div>
								<span
									className={cn(
										"shrink-0 font-mono tabular-nums",
										c.amount < 0 && "text-success",
									)}
								>
									{c.amount < 0 ? "−" : ""}
									{formatCurrency(Math.abs(c.amount))}
								</span>
							</li>
						))}
					</ul>
				)}
			</ContentCardSection>
		</ContentCard>
	);
}

function Row({
	label,
	value,
	tone,
}: {
	label: string;
	value: number;
	tone?: "good" | "warn";
}) {
	return (
		<div className="flex items-center justify-between gap-3">
			<dt className="text-muted-foreground">{label}</dt>
			<dd
				className={cn(
					"font-mono tabular-nums",
					tone === "good" && "text-success",
					tone === "warn" && "text-warning",
				)}
			>
				{formatCurrency(value)}
			</dd>
		</div>
	);
}
