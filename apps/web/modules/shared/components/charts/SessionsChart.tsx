"use client";

import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@ui/components/chart";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { CHART_TOKENS, formatNumber, formatShortDate } from "./chart-utils";

export interface SessionsPoint {
	date: string;
	sessions: number;
}

interface SessionsChartProps {
	data: SessionsPoint[];
	height?: number;
}

const config = {
	sessions: { label: "Sessions", color: CHART_TOKENS.c2 },
} satisfies ChartConfig;

export function SessionsChart({ data, height = 200 }: SessionsChartProps) {
	return (
		<ChartContainer config={config} style={{ height }} className="w-full">
			<LineChart
				data={data}
				margin={{ left: 4, right: 4, top: 8, bottom: 0 }}
			>
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
							formatter={(value) => [
								` ${formatNumber(Number(value))}`,
								"Sessions",
							]}
						/>
					}
				/>
				<Line
					type="monotone"
					dataKey="sessions"
					stroke={CHART_TOKENS.c2}
					strokeWidth={2}
					dot={false}
					isAnimationActive
					animationDuration={320}
				/>
			</LineChart>
		</ChartContainer>
	);
}
