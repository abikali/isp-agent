"use client";

import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@ui/components/chart";
import { Cell, Label, Pie, PieChart } from "recharts";
import { CHART_TOKENS, formatNumber } from "./chart-utils";

interface ResolutionRateDonutProps {
	resolved: number;
	escalated: number;
	abandoned: number;
	height?: number;
}

const config = {
	value: { label: "Conversations" },
} satisfies ChartConfig;

export function ResolutionRateDonut({
	resolved,
	escalated,
	abandoned,
	height = 220,
}: ResolutionRateDonutProps) {
	const total = resolved + escalated + abandoned;
	const data = [
		{ name: "Resolved", value: resolved, fill: CHART_TOKENS.c2 },
		{ name: "Escalated", value: escalated, fill: CHART_TOKENS.c3 },
		{ name: "Abandoned", value: abandoned, fill: CHART_TOKENS.axis },
	];

	const rate = total > 0 ? Math.round((resolved / total) * 100) : 0;

	return (
		<ChartContainer config={config} style={{ height }} className="w-full">
			<PieChart>
				<ChartTooltip
					content={
						<ChartTooltipContent
							formatter={(value, _n, item) => [
								` ${formatNumber(Number(value))}`,
								item.payload.name,
							]}
							hideLabel
						/>
					}
				/>
				<Pie
					data={data}
					dataKey="value"
					nameKey="name"
					innerRadius="55%"
					outerRadius="80%"
					paddingAngle={2}
					stroke="var(--card)"
					strokeWidth={2}
					isAnimationActive
					animationDuration={320}
				>
					{data.map((d) => (
						<Cell key={d.name} fill={d.fill} />
					))}
					<Label
						content={({ viewBox }) => {
							if (!viewBox || !("cx" in viewBox)) {
								return null;
							}
							return (
								<text
									x={viewBox.cx}
									y={viewBox.cy}
									textAnchor="middle"
									dominantBaseline="central"
								>
									<tspan
										x={viewBox.cx}
										dy="-0.4em"
										className="fill-foreground text-lg font-medium tabular-nums"
									>
										{rate}%
									</tspan>
									<tspan
										x={viewBox.cx}
										dy="1.4em"
										className="fill-muted-foreground text-[10px] uppercase tracking-wider"
									>
										Resolved
									</tspan>
								</text>
							);
						}}
					/>
				</Pie>
			</PieChart>
		</ChartContainer>
	);
}
