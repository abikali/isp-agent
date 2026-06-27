"use client";

import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@ui/components/chart";
// react-doctor-disable-next-line react-doctor/prefer-dynamic-import -- recharts sub-components are config children read via child.type; lazy-wrapping breaks detection, and @ui/components/chart already imports recharts statically so no bundle savings here (lazy boundary belongs at consumers)
import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from "recharts";
import {
	CHART_TOKENS,
	formatCompactCurrency,
	formatCurrency,
	formatShortDate,
} from "./chart-utils";

export interface RevenuePoint {
	date: string;
	current: number;
	previous?: number;
}

interface RevenueChartProps {
	data: RevenuePoint[];
	currency?: string;
	height?: number;
	showPrevious?: boolean;
}

const config = {
	current: { label: "This period", color: CHART_TOKENS.c1 },
	previous: { label: "Previous period", color: CHART_TOKENS.axis },
} satisfies ChartConfig;

export function RevenueChart({
	data,
	currency = "USD",
	height = 240,
	showPrevious = true,
}: RevenueChartProps) {
	return (
		<ChartContainer config={config} style={{ height }} className="w-full">
			<AreaChart
				data={data}
				margin={{ left: 4, right: 4, top: 8, bottom: 0 }}
			>
				<defs>
					<linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
						<stop
							offset="0%"
							stopColor={CHART_TOKENS.c1}
							stopOpacity={0.25}
						/>
						<stop
							offset="100%"
							stopColor={CHART_TOKENS.c1}
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
					tickFormatter={(v) => formatCompactCurrency(v, currency)}
					stroke={CHART_TOKENS.axis}
					tickLine={false}
					axisLine={false}
					fontSize={11}
					width={48}
				/>
				<ChartTooltip
					content={
						<ChartTooltipContent
							labelFormatter={(v) => formatShortDate(v)}
							formatter={(value, name) => [
								` ${formatCurrency(Number(value), currency)}`,
								name === "current" ? "This period" : "Previous",
							]}
						/>
					}
				/>
				<Area
					type="monotone"
					dataKey="current"
					stroke={CHART_TOKENS.c1}
					strokeWidth={2}
					fill="url(#revFill)"
					isAnimationActive
					animationDuration={320}
				/>
				{showPrevious && (
					<Line
						type="monotone"
						dataKey="previous"
						stroke={CHART_TOKENS.axis}
						strokeWidth={1}
						strokeDasharray="4 4"
						dot={false}
						isAnimationActive
						animationDuration={320}
					/>
				)}
			</AreaChart>
		</ChartContainer>
	);
}
