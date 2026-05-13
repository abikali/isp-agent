"use client";

import { type ChartConfig, ChartContainer } from "@ui/components/chart";
import { PolarAngleAxis, RadialBar, RadialBarChart } from "recharts";
import {
	CHART_TOKENS,
	formatCompactCurrency,
	formatSmartPercent,
} from "./chart-utils";

interface CollectedVsTargetProps {
	collected: number;
	target: number;
	currency?: string;
	height?: number;
	/** When true, render the collected/target line as currency. Default true. */
	asCurrency?: boolean;
	/** Override the bottom caption entirely (e.g. "9 of 1957 customers"). */
	caption?: string;
}

const config = {
	value: { label: "Collected", color: CHART_TOKENS.c1 },
} satisfies ChartConfig;

export function CollectedVsTarget({
	collected,
	target,
	currency = "USD",
	height = 220,
	asCurrency = true,
	caption,
}: CollectedVsTargetProps) {
	const rawPct = target > 0 ? (collected / target) * 100 : 0;
	const pct = Math.min(100, rawPct);
	// Make a tiny but non-zero value visible on the arc so the dial doesn't
	// look empty when progress is real but sub-1%.
	const displayValue = rawPct > 0 ? Math.max(1.5, pct) : 0;
	const data = [
		{ name: "collected", value: displayValue, fill: CHART_TOKENS.c1 },
	];

	const captionText =
		caption ??
		(asCurrency
			? `${formatCompactCurrency(collected, currency)} of ${formatCompactCurrency(target, currency)}`
			: `${collected.toLocaleString()} of ${target.toLocaleString()}`);

	return (
		<div className="relative w-full" style={{ height }}>
			<ChartContainer config={config} className="h-full w-full">
				<RadialBarChart
					data={data}
					startAngle={210}
					endAngle={-30}
					innerRadius="70%"
					outerRadius="100%"
				>
					<PolarAngleAxis
						type="number"
						domain={[0, 100]}
						tick={false}
					/>
					<RadialBar
						dataKey="value"
						background={{ fill: "var(--muted)" }}
						cornerRadius={8}
						isAnimationActive
						animationDuration={400}
					/>
				</RadialBarChart>
			</ChartContainer>
			<div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
				<div className="text-2xl font-medium tabular-nums">
					{formatSmartPercent(rawPct)}
				</div>
				<div className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
					{captionText}
				</div>
			</div>
		</div>
	);
}
