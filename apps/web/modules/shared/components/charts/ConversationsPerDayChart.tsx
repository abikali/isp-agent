"use client";

import {
	type ChartConfig,
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
	ChartTooltipContent,
} from "@ui/components/chart";
// react-doctor-disable-next-line react-doctor/prefer-dynamic-import -- recharts sub-components are config children read via child.type; lazy-wrapping breaks detection, and @ui/components/chart already imports recharts statically so no bundle savings here (lazy boundary belongs at consumers)
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { CHART_TOKENS, formatShortDate } from "./chart-utils";

export interface ConversationsPoint {
	date: string;
	web?: number;
	whatsapp?: number;
	telegram?: number;
}

interface ConversationsPerDayChartProps {
	data: ConversationsPoint[];
	height?: number;
}

const config = {
	web: { label: "Web", color: CHART_TOKENS.c1 },
	whatsapp: { label: "WhatsApp", color: CHART_TOKENS.c2 },
	telegram: { label: "Telegram", color: CHART_TOKENS.c5 },
} satisfies ChartConfig;

export function ConversationsPerDayChart({
	data,
	height = 220,
}: ConversationsPerDayChartProps) {
	return (
		<ChartContainer config={config} style={{ height }} className="w-full">
			<BarChart
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
						/>
					}
				/>
				<ChartLegend content={<ChartLegendContent />} />
				<Bar
					dataKey="web"
					stackId="a"
					fill={CHART_TOKENS.c1}
					radius={[0, 0, 0, 0]}
					isAnimationActive
					animationDuration={320}
				/>
				<Bar
					dataKey="whatsapp"
					stackId="a"
					fill={CHART_TOKENS.c2}
					isAnimationActive
					animationDuration={320}
				/>
				<Bar
					dataKey="telegram"
					stackId="a"
					fill={CHART_TOKENS.c5}
					radius={[4, 4, 0, 0]}
					isAnimationActive
					animationDuration={320}
				/>
			</BarChart>
		</ChartContainer>
	);
}
