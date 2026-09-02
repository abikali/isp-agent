"use client";

import { formatCurrency } from "@shared/lib/format";
import { Link } from "@tanstack/react-router";
import { cn } from "@ui/lib";
import { HandCoinsIcon, WalletIcon } from "lucide-react";

interface OwedProps {
	total: number;
	count: number;
	byMonth: Array<{
		year: number;
		month: number;
		amount: number;
		count: number;
	}>;
	collectPath: string;
}

const MONTHS = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

/**
 * "What am I owed?" — subscribers who have been billed and have not paid.
 *
 * The oldest unpaid month is the number that matters: $2,000 owed from this
 * month is normal business, $2,000 owed from four months ago is a problem.
 * So the card leads with age, not just amount.
 */
export function OwedCard({ total, count, byMonth, collectPath }: OwedProps) {
	const oldest = byMonth[0];
	const now = new Date();
	const monthsBehind = oldest
		? (now.getUTCFullYear() - oldest.year) * 12 +
			(now.getUTCMonth() + 1 - oldest.month)
		: 0;

	const stale = monthsBehind >= 2;

	return (
		<Link
			to={collectPath}
			className="group block rounded-xl border border-border bg-card p-5 shadow-xs transition-colors hover:border-foreground/20"
		>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
						<HandCoinsIcon className="size-3.5" />
						People still owe you
						<RightNow />
					</div>
					<div className="mt-2 text-3xl font-medium tabular-nums leading-none tracking-tight">
						{formatCurrency(total)}
					</div>
					<p className="mt-2 text-sm text-muted-foreground">
						{count === 0
							? "Everyone has paid. Nothing outstanding."
							: `${count} ${count === 1 ? "subscriber has" : "subscribers have"} not paid yet.`}
					</p>
				</div>
			</div>

			{oldest && (
				<div
					className={cn(
						"mt-4 rounded-lg border px-3 py-2 text-xs",
						stale
							? "border-warning/30 bg-warning/[0.06] text-warning"
							: "border-border bg-muted/40 text-muted-foreground",
					)}
				>
					{stale ? "Oldest unpaid is " : "Oldest unpaid is from "}
					<span className="font-medium">
						{MONTHS[oldest.month - 1]} {oldest.year}
					</span>
					{stale && <> — {monthsBehind} months behind</>}.
				</div>
			)}

			<div className="mt-3 text-xs font-medium text-muted-foreground group-hover:text-foreground">
				See who hasn't paid →
			</div>
		</Link>
	);
}

interface HeldProps {
	total: number;
	holders: Array<{ employeeId: string; name: string; amount: number }>;
	collectorsPath: string;
}

/**
 * "Where is my cash?" — money collected but not yet handed to the office.
 *
 * This is the figure the old dashboard mistook for profit. It is a real and
 * useful number; it is just an answer to a completely different question, so it
 * gets its own card and is never mixed into the money-in/out statement.
 */
export function HeldCard({ total, holders, collectorsPath }: HeldProps) {
	const top = holders.filter((h) => h.amount > 0).slice(0, 3);

	return (
		<Link
			to={collectorsPath}
			className="group block rounded-xl border border-border bg-card p-5 shadow-xs transition-colors hover:border-foreground/20"
		>
			<div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
				<WalletIcon className="size-3.5" />
				Cash your team is holding
				<RightNow />
			</div>
			<div className="mt-2 text-3xl font-medium tabular-nums leading-none tracking-tight">
				{formatCurrency(total)}
			</div>
			<p className="mt-2 text-sm text-muted-foreground">
				{total <= 0
					? "Everything collected has reached the office."
					: "Collected from subscribers, not handed in to the office yet. It becomes money in when they hand it over. Built up over every month, not just the one selected above."}
			</p>

			{top.length > 0 && (
				<ul className="mt-4 space-y-1.5 border-t border-border pt-3">
					{top.map((holder) => (
						<li
							key={holder.employeeId}
							className="flex items-center justify-between gap-3 text-xs"
						>
							<span className="truncate text-muted-foreground">
								{holder.name}
							</span>
							<span className="shrink-0 font-medium tabular-nums">
								{formatCurrency(holder.amount)}
							</span>
						</li>
					))}
				</ul>
			)}

			<div className="mt-3 text-xs font-medium text-muted-foreground group-hover:text-foreground">
				See everyone →
			</div>
		</Link>
	);
}

/**
 * The two position cards ignore the period filter — they are a balance, not a
 * flow. Saying so on the card is what stops "why doesn't this change when I
 * pick last month?".
 */
function RightNow() {
	return (
		<span
			className="ml-auto rounded-full border border-border px-1.5 py-px text-[10px] font-medium normal-case tracking-normal"
			title="A balance as of now. The period filter does not apply."
		>
			Right now
		</span>
	);
}
