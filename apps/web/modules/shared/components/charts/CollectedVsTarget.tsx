"use client";

import { type ChartConfig, ChartContainer } from "@ui/components/chart";
import { PolarAngleAxis, RadialBar, RadialBarChart } from "recharts";
import {
	CHART_TOKENS,
	formatCompactCurrency,
	formatPercent,
} from "./chart-utils";

interface CollectedVsTargetProps {
	collected: number;
	target: number;
	currency?: string;
	height?: number;
}

const config = {
	value: { label: "Collected", color: CHART_TOKENS.c1 },
} satisfies ChartConfig;

export function CollectedVsTarget({
	collected,
	target,
	currency = "USD",
	height = 220,
}: CollectedVsTargetProps) {
	const pct = target > 0 ? Math.min(100, (collected / target) * 100) : 0;
	const data = [{ name: "collected", value: pct, fill: CHART_TOKENS.c1 }];

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
					{formatPercent(pct)}
				</div>
				<div className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
					{formatCompactCurrency(collected, currency)} of{" "}
					{formatCompactCurrency(target, currency)}
				</div>
			</div>
		</div>
	);
}
