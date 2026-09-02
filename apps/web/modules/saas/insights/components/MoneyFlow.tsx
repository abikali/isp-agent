"use client";

import { formatCurrency } from "@shared/lib/format";
import { cn } from "@ui/lib";
import { BuildingIcon } from "lucide-react";

interface MoneyFlowProps {
	periodLabel: string;
	moneyIn: number;
	moneyOut: number;
	kept: number;
	/** Cash collectors physically handed to the office in the period. */
	handedIn: { total: number; count: number };
	/** Split of what came in. Rendered as a bar so the two businesses are
	 *  visible at a glance rather than blended into one figure. */
	streams?: Array<{ label: string; amount: number; color: string }>;
}

/**
 * In → out → kept, as one continuous statement.
 *
 * Three separate metric cards make the reader do the arithmetic and, worse,
 * make it possible to read "money out" as a standalone catastrophe. Showing the
 * subtraction as a sentence removes both problems.
 */
export function MoneyFlow({
	periodLabel,
	moneyIn,
	moneyOut,
	kept,
	handedIn,
	streams,
}: MoneyFlowProps) {
	const positive = kept >= 0;
	const total = streams?.reduce((sum, s) => sum + s.amount, 0) ?? 0;

	return (
		<section className="rounded-xl border border-border bg-card p-5 shadow-xs md:p-6">
			<div className="mb-4 flex items-center justify-between gap-3">
				<span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
					{periodLabel}
				</span>
			</div>
			<div className="grid gap-5 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center sm:gap-4">
				<Figure
					label="Money in"
					value={moneyIn}
					tone="text-foreground"
				/>
				<Operator symbol="−" />
				<Figure
					label="Money out"
					value={moneyOut}
					tone="text-foreground"
				/>
				<Operator symbol="=" />
				<Figure
					label={positive ? "You kept" : "You're short"}
					value={Math.abs(kept)}
					tone={positive ? "text-success" : "text-destructive"}
					emphasis
				/>
			</div>

			<div className="mt-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-t border-border pt-4">
				<div className="min-w-0">
					<div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
						<BuildingIcon className="size-3.5" />
						Handed in to the office
					</div>
					<div className="mt-1 text-xl font-medium tabular-nums leading-none tracking-tight">
						{formatCurrency(handedIn.total)}
					</div>
				</div>
				<p className="max-w-md text-pretty text-xs text-muted-foreground sm:text-right">
					{handedIn.count === 0
						? "No collector has handed cash in yet this period."
						: `Received from your team in ${handedIn.count} ${handedIn.count === 1 ? "handoff" : "handoffs"}.`}{" "}
					Money in counts a payment when a collector records it; this
					counts the cash when it reaches you. One handoff can carry
					money from several months, so the two don't subtract.
				</p>
			</div>

			{streams && streams.length > 0 && total > 0 && (
				<div className="mt-5 space-y-2 border-t border-border pt-4">
					<div className="flex h-2 overflow-hidden rounded-full bg-muted">
						{streams.map((stream) => (
							<div
								key={stream.label}
								className="h-full first:rounded-l-full last:rounded-r-full"
								style={{
									width: `${(stream.amount / total) * 100}%`,
									backgroundColor: stream.color,
								}}
							/>
						))}
					</div>
					<div className="flex flex-wrap gap-x-5 gap-y-1.5">
						{streams.map((stream) => (
							<div
								key={stream.label}
								className="flex items-center gap-2 text-xs"
							>
								<span
									className="size-2 shrink-0 rounded-full"
									style={{ backgroundColor: stream.color }}
								/>
								<span className="text-muted-foreground">
									{stream.label}
								</span>
								<span className="font-medium tabular-nums">
									{formatCurrency(stream.amount)}
								</span>
							</div>
						))}
					</div>
				</div>
			)}
		</section>
	);
}

function Figure({
	label,
	value,
	tone,
	emphasis,
}: {
	label: string;
	value: number;
	tone: string;
	emphasis?: boolean;
}) {
	return (
		<div className="min-w-0">
			<div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
				{label}
			</div>
			<div
				className={cn(
					"mt-1 truncate font-medium tabular-nums leading-none tracking-tight",
					emphasis ? "text-3xl md:text-4xl" : "text-2xl md:text-3xl",
					tone,
				)}
			>
				{formatCurrency(value)}
			</div>
		</div>
	);
}

function Operator({ symbol }: { symbol: string }) {
	return (
		<div
			aria-hidden
			className="hidden select-none text-2xl font-light text-muted-foreground/50 sm:block"
		>
			{symbol}
		</div>
	);
}
