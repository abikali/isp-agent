"use client";

import { formatCurrency } from "@shared/lib/format";
import { cn } from "@ui/lib";
import { ArrowRightIcon } from "lucide-react";

interface MoneyFlowProps {
	moneyIn: number;
	moneyOut: number;
	kept: number;
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
	moneyIn,
	moneyOut,
	kept,
	streams,
}: MoneyFlowProps) {
	const positive = kept >= 0;
	const total = streams?.reduce((sum, s) => sum + s.amount, 0) ?? 0;

	return (
		<section className="rounded-xl border border-border bg-card p-5 shadow-xs md:p-6">
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

/** Mobile-friendly divider used between stacked figures on narrow screens. */
export function FlowArrow() {
	return (
		<ArrowRightIcon
			aria-hidden
			className="size-4 rotate-90 text-muted-foreground/40 sm:rotate-0"
		/>
	);
}
