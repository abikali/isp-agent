"use client";

import { formatCurrency } from "@shared/lib/format";
import { cn } from "@ui/lib";

interface MoneyFlowProps {
	periodLabel: string;
	/** Everything the business took in during the period. */
	earned: number;
	/** Every approved cost in the period, whoever paid it. */
	spent: number;
	/** earned − spent. What running the business itself left. */
	kept: number;
	/** Money an owner or partner took out. Real cash gone, but not a cost of
	 *  operating — shown under the equation, never inside it. */
	draws: number;
	/** kept − draws: what actually stayed in the business. */
	net: number;
	/** Cash POSITION, not part of the arithmetic: balances read from their own
	 *  ledgers, never derived from `earned`. */
	cash: {
		reachedOffice: number;
		handoffs: number;
		/** Collected but not handed in yet, across all periods. */
		inTeamHands: number;
		/** What dealers owe on the receivable ledger; null for a reseller org. */
		dealersOwe: number | null;
		/** Dealer charges raised this period (for the dealers-owe hint). */
		dealersCharged: number;
		/** Cash dealers paid in this period. Already inside `earned` from the
		 *  moment they were charged, so it is shown as position only. */
		dealerPayments: { total: number; count: number };
	};
	/** Split of what was earned. Rendered as a bar so the parts are visible at
	 *  a glance rather than blended into one figure. */
	streams?: Array<{ label: string; amount: number; color: string }>;
}

/**
 * Earned → spent → kept, as one continuous statement.
 *
 * Three separate metric cards make the reader do the arithmetic and, worse,
 * make it possible to read "spent" as a standalone catastrophe. Showing the
 * subtraction as a sentence removes both problems.
 *
 * Two rules this card exists to hold:
 *
 *   · Only earnings go in the subtraction. Cash handed in to the office is a
 *     TRANSFER between people inside the company (see money-model.ts) and can
 *     never be the income side of a profit statement — doing that charged the
 *     business twice for anything a worker paid for out of collected cash.
 *   · Owner draws sit outside the sum. "Is the business profitable?" and
 *     "what did I take out?" are different questions and get different lines.
 *
 * Every figure carries a one-line meaning underneath it. That line is the
 * whole explanation — there is no paragraph to read, because the owner will
 * not read it.
 */
export function MoneyFlow({
	periodLabel,
	earned,
	spent,
	kept,
	draws,
	net,
	cash,
	streams,
}: MoneyFlowProps) {
	const positive = kept >= 0;
	const netPositive = net >= 0;
	const total = streams?.reduce((sum, s) => sum + s.amount, 0) ?? 0;
	const handoffs =
		cash.handoffs === 0
			? "no handoffs yet"
			: `${cash.handoffs} ${cash.handoffs === 1 ? "handoff" : "handoffs"}`;
	const dealerCount = cash.dealerPayments.count;
	const dealerPayments =
		dealerCount === 0
			? "No dealer payments this period."
			: `${dealerCount} ${dealerCount === 1 ? "payment" : "payments"} · already inside "You earned" from when the dealer was charged, so not added again.`;

	return (
		<section className="rounded-xl border border-border bg-card p-5 shadow-xs md:p-6">
			<div className="mb-4 flex items-center justify-between gap-3">
				<span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
					{periodLabel}
				</span>
			</div>

			<div className="grid gap-5 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-start sm:gap-4">
				<Figure
					label="You earned"
					value={earned}
					tone="text-foreground"
					hint="Everything your team took in from customers and dealers (dealer charges count when billed, not when paid)"
				/>
				<Operator symbol="−" />
				<Figure
					label="You spent"
					value={spent}
					tone="text-foreground"
					hint="Approved costs, whoever paid them"
				/>
				<Operator symbol="=" />
				<Figure
					label={positive ? "You kept" : "You're short"}
					value={Math.abs(kept)}
					tone={positive ? "text-success" : "text-destructive"}
					hint="What running the business left"
					emphasis
				/>
			</div>

			{streams && streams.length > 0 && total > 0 && (
				<div className="mt-5 space-y-2">
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
								className="flex items-center gap-1.5 text-xs"
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

			{draws > 0 && (
				<div className="mt-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg border border-dashed border-border px-4 py-3">
					<div>
						<div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
							You took out
						</div>
						<div className="mt-1 text-xs text-muted-foreground">
							Money you or a partner took for yourselves. Not a
							cost of running the business, so it sits outside the
							sum above —{" "}
							{netPositive
								? `${formatCurrency(net)} stayed in.`
								: `it left the business ${formatCurrency(Math.abs(net))} down.`}
						</div>
					</div>
					<div className="text-xl font-medium tabular-nums leading-none tracking-tight">
						−{formatCurrency(draws)}
					</div>
				</div>
			)}

			<div className="mt-5 border-t border-border pt-4">
				<div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
					Where that money is
				</div>
				<p className="mt-1 text-xs text-muted-foreground">
					Earning it and holding it are different things. This does
					not change the figures above.
				</p>
				<div className="mt-3 grid gap-3 sm:grid-cols-2">
					<Position
						label="Reached the office"
						value={cash.reachedOffice}
						hint={`Handed in by your team · ${handoffs}`}
					/>
					<Position
						label="Dealer payments received"
						value={cash.dealerPayments.total}
						hint={dealerPayments}
						muted={dealerCount === 0}
					/>
					<Position
						label="Held by the team now"
						value={cash.inTeamHands}
						hint={
							cash.inTeamHands > 0
								? "Collected but not handed in yet, across all periods."
								: "Your team holds no cash right now."
						}
						muted={cash.inTeamHands === 0}
					/>
					{cash.dealersOwe !== null && (
						<Position
							label="Dealers still owe"
							value={cash.dealersOwe}
							hint={`What dealers owe you on their account · charged ${formatCurrency(cash.dealersCharged)} this period, paid ${formatCurrency(cash.dealerPayments.total)}.`}
							muted={cash.dealersOwe <= 0}
						/>
					)}
				</div>
			</div>
		</section>
	);
}

function Figure({
	label,
	value,
	tone,
	hint,
	emphasis,
}: {
	label: string;
	value: number;
	tone: string;
	hint: string;
	emphasis?: boolean;
}) {
	return (
		<div>
			<div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
				{label}
			</div>
			<div
				className={cn(
					"mt-1.5 font-medium tabular-nums leading-none tracking-tight",
					emphasis ? "text-4xl" : "text-3xl",
					tone,
				)}
			>
				{formatCurrency(value)}
			</div>
			<p className="mt-2 text-pretty text-xs text-muted-foreground">
				{hint}
			</p>
		</div>
	);
}

function Position({
	label,
	value,
	hint,
	muted,
}: {
	label: string;
	value: number;
	hint: string;
	muted?: boolean;
}) {
	return (
		<div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
			<div className="flex items-baseline justify-between gap-3">
				<span className="text-xs font-medium">{label}</span>
				<span
					className={cn(
						"text-lg font-medium tabular-nums leading-none tracking-tight",
						muted && "text-muted-foreground",
					)}
				>
					{formatCurrency(value)}
				</span>
			</div>
			<p className="mt-1.5 text-pretty text-xs text-muted-foreground">
				{hint}
			</p>
		</div>
	);
}

function Operator({ symbol }: { symbol: string }) {
	return (
		<div
			aria-hidden
			className="hidden self-start pt-5 text-2xl font-light text-muted-foreground sm:block"
		>
			{symbol}
		</div>
	);
}
