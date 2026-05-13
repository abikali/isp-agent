"use client";

import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@ui/components/chart";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { CHART_TOKENS, formatShortDate } from "./chart-utils";

export interface CustomersPoint {
	date: string;
	added: number;
	cumulative: number;
}

interface CustomersChartProps {
	data: CustomersPoint[];
	height?: number;
}

const config = {
	added: { label: "New", color: CHART_TOKENS.c2 },
	cumulative: { label: "Running total", color: CHART_TOKENS.c1 },
} satisfies ChartConfig;

export function CustomersChart({ data, height = 240 }: CustomersChartProps) {
	return (
		<ChartContainer config={config} style={{ height }} className="w-full">
			<AreaChart
				data={data}
				margin={{ left: 4, right: 4, top: 8, bottom: 0 }}
			>
				<defs>
					<linearGradient id="addedFill" x1="0" y1="0" x2="0" y2="1">
						<stop
							offset="0%"
							stopColor={CHART_TOKENS.c2}
							stopOpacity={0.35}
						/>
						<stop
							offset="100%"
							stopColor={CHART_TOKENS.c2}
							stopOpacity={0}
						/>
					</linearGradient>
				</defs>
				<CartesianGrid
					strokeDasharray="3 3"
					stroke={CHART_TOKENS.grid}
					vertical={false}
				/>
				<XAxis
					dataKey="date"
					tickFormatter={(v) => formatShortDate(v)}
					stroke={CHART_TOKENS.axis}
					tickLine={false}
					axisLine={false}
					fontSize={11}
				/>
				<YAxis
					stroke={CHART_TOKENS.axis}
					tickLine={false}
					axisLine={false}
					fontSize={11}
					width={32}
				/>
				<ChartTooltip
					content={
						<ChartTooltipContent
							labelFormatter={(v) => formatShortDate(v)}
						/>
					}
				/>
				<Area
					type="monotone"
					dataKey="added"
					stroke={CHART_TOKENS.c2}
					strokeWidth={2}
					fill="url(#addedFill)"
					isAnimationActive
					animationDuration={320}
				/>
			</AreaChart>
		</ChartContainer>
	);
}
