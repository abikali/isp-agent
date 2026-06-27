"use client";

import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@ui/components/chart";
// react-doctor-disable-next-line react-doctor/prefer-dynamic-import -- recharts sub-components are config children read via child.type; lazy-wrapping breaks detection, and @ui/components/chart already imports recharts statically so no bundle savings here (lazy boundary belongs at consumers)
import { Bar, BarChart, Cell, XAxis, YAxis } from "recharts";
import { CHART_TOKENS, formatNumber } from "./chart-utils";

export interface ToolInvocation {
	tool: string;
	count: number;
}

interface ToolInvocationChartProps {
	data: ToolInvocation[];
	height?: number;
}

const config = {
	count: { label: "Calls", color: CHART_TOKENS.c4 },
} satisfies ChartConfig;

const PALETTE = [
	CHART_TOKENS.c1,
	CHART_TOKENS.c2,
	CHART_TOKENS.c3,
	CHART_TOKENS.c4,
	CHART_TOKENS.c5,
	CHART_TOKENS.c6,
];

export function ToolInvocationChart({
	data,
	height = 280,
}: ToolInvocationChartProps) {
	const sorted = [...data].sort((a, b) => b.count - a.count).slice(0, 10);

	return (
		<ChartContainer config={config} style={{ height }} className="w-full">
			<BarChart
				layout="vertical"
				data={sorted}
				margin={{ left: 0, right: 16, top: 4, bottom: 4 }}
			>
				<XAxis
					type="number"
					tickFormatter={(v) => formatNumber(v)}
					stroke={CHART_TOKENS.axis}
					tickLine={false}
					axisLine={false}
					fontSize={11}
				/>
				<YAxis
					type="category"
					dataKey="tool"
					stroke={CHART_TOKENS.axis}
					tickLine={false}
					axisLine={false}
					fontSize={11}
					width={140}
				/>
				<ChartTooltip
					content={
						<ChartTooltipContent
							formatter={(value, _name, item) => [
								` ${formatNumber(Number(value))} calls`,
								(item.payload as ToolInvocation).tool,
							]}
							hideLabel
						/>
					}
				/>
				<Bar
					dataKey="count"
					radius={[0, 4, 4, 0]}
					isAnimationActive
					animationDuration={320}
				>
					{sorted.map((d, i) => (
						<Cell
							key={d.tool}
							fill={
								PALETTE[i % PALETTE.length] ?? CHART_TOKENS.c4
							}
						/>
					))}
				</Bar>
			</BarChart>
		</ChartContainer>
	);
}
