"use client";

import { formatCurrency } from "@shared/lib/format";
import { Skeleton } from "@ui/components/skeleton";
import { cn } from "@ui/lib";
import { ArrowDownRightIcon, ArrowUpRightIcon } from "lucide-react";

interface Row {
	label: string;
	amount: number;
	previous: number;
	delta: number;
}

interface DetailPanelProps {
	comparisonLabel: string;
	revenue: Row[];
	costs: Row[];
	draws: Row[];
	isLoading: boolean;
}

/**
 * The evidence behind the headline.
 *
 * Hard rule: this panel may add detail but must never contradict the summary
 * above it. Both read the same server functions, so the two cannot drift.
 *
 * Draws are listed in their own block rather than among the costs. Money the
 * owner pays himself is not a cost of running the business, and merging the two
 * is what makes an owner think his company is barely surviving when it is in
 * fact paying him well.
 */
export function DetailPanel({
	comparisonLabel,
	revenue,
	costs,
	draws,
	isLoading,
}: DetailPanelProps) {
	if (isLoading) {
		return (
			<div className="space-y-3 pt-2">
				{Array.from({ length: 6 }).map((_, i) => (
					<Skeleton key={i} className="h-10 rounded-md" />
				))}
			</div>
		);
	}

	return (
		<div className="grid gap-6 pt-2 lg:grid-cols-2">
			<Block
				title="Where the money came from"
				rows={revenue}
				comparisonLabel={comparisonLabel}
				goodWhenUp
				emptyText="No income recorded for this period."
			/>
			<div className="space-y-6">
				<Block
					title="Where the money went"
					rows={costs}
					comparisonLabel={comparisonLabel}
					emptyText="No spending recorded for this period."
				/>
				{draws.length > 0 && (
					<Block
						title="What you took out"
						note="Your own money, not a business cost — kept separate so you can still see whether the business itself makes money."
						rows={draws}
						comparisonLabel={comparisonLabel}
						emptyText=""
					/>
				)}
			</div>
		</div>
	);
}

function Block({
	title,
	note,
	rows,
	comparisonLabel,
	goodWhenUp,
	emptyText,
}: {
	title: string;
	note?: string;
	rows: Row[];
	comparisonLabel: string;
	goodWhenUp?: boolean;
	emptyText: string;
}) {
	const total = rows.reduce((sum, r) => sum + r.amount, 0);

	if (rows.length === 0) {
		return (
			<section>
				<Header title={title} total={total} note={note} />
				<p className="pt-3 text-sm text-muted-foreground">
					{emptyText}
				</p>
			</section>
		);
	}

	return (
		<section>
			<Header title={title} total={total} note={note} />
			<ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card">
				{rows.map((row) => {
					const meaningful =
						Math.abs(row.delta) > 0.005 && row.previous > 0;
					const up = row.delta > 0;
					// For income, up is good. For spending, up is bad.
					const positive = goodWhenUp ? up : !up;

					return (
						<li
							key={row.label}
							className="flex items-center justify-between gap-4 px-4 py-2.5"
						>
							<span className="min-w-0 flex-1 truncate text-sm">
								{row.label}
							</span>
							<div className="flex shrink-0 items-center gap-3">
								{meaningful && (
									<span
										className={cn(
											"flex items-center gap-0.5 text-xs tabular-nums",
											positive
												? "text-success"
												: "text-muted-foreground",
										)}
										title={`${formatCurrency(row.previous)} in ${comparisonLabel}`}
									>
										{up ? (
											<ArrowUpRightIcon className="size-3" />
										) : (
											<ArrowDownRightIcon className="size-3" />
										)}
										{formatCurrency(Math.abs(row.delta))}
									</span>
								)}
								<span className="w-24 text-right text-sm font-medium tabular-nums">
									{formatCurrency(row.amount)}
								</span>
							</div>
						</li>
					);
				})}
			</ul>
			<p className="mt-2 text-[11px] text-muted-foreground">
				Arrows compare against {comparisonLabel}.
			</p>
		</section>
	);
}

function Header({
	title,
	total,
	note,
}: {
	title: string;
	total: number;
	note?: string;
}) {
	return (
		<div className="space-y-1">
			<div className="flex items-baseline justify-between gap-3">
				<h3 className="text-sm font-medium">{title}</h3>
				<span className="text-sm font-medium tabular-nums text-muted-foreground">
					{formatCurrency(total)}
				</span>
			</div>
			{note && (
				<p className="text-pretty text-xs text-muted-foreground">
					{note}
				</p>
			)}
		</div>
	);
}
