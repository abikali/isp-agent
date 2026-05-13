"use client";

import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@ui/components/chart";
import { Bar, BarChart, Cell, XAxis, YAxis } from "recharts";
import { CHART_TOKENS, formatBytes } from "./chart-utils";

export interface TopConsumerEntry {
	username: string;
	fullName?: string;
	bytes: number;
}

interface TopConsumersChartProps {
	data: TopConsumerEntry[];
	height?: number;
	onConsumerClick?: (username: string) => void;
}

const config = {
	bytes: { label: "Bandwidth", color: CHART_TOKENS.c4 },
} satisfies ChartConfig;

export function TopConsumersChart({
	data,
	height = 320,
	onConsumerClick,
}: TopConsumersChartProps) {
	const sorted = [...data].sort((a, b) => b.bytes - a.bytes).slice(0, 10);

	return (
		<ChartContainer config={config} style={{ height }} className="w-full">
			<BarChart
				layout="vertical"
				data={sorted}
				margin={{ left: 0, right: 16, top: 4, bottom: 4 }}
			>
				<XAxis
					type="number"
					tickFormatter={(v) => formatBytes(v)}
					stroke={CHART_TOKENS.axis}
					tickLine={false}
					axisLine={false}
					fontSize={11}
				/>
				<YAxis
					type="category"
					dataKey={(d: TopConsumerEntry) => d.fullName ?? d.username}
					stroke={CHART_TOKENS.axis}
					tickLine={false}
					axisLine={false}
					fontSize={11}
					width={120}
				/>
				<ChartTooltip
					content={
						<ChartTooltipContent
							formatter={(value, _name, item) => [
								` ${formatBytes(Number(value))}`,
								(item.payload as TopConsumerEntry).fullName ??
									(item.payload as TopConsumerEntry).username,
							]}
							hideLabel
						/>
					}
				/>
				<Bar
					dataKey="bytes"
					radius={[0, 4, 4, 0]}
					isAnimationActive
					animationDuration={320}
					onClick={(d) =>
						onConsumerClick?.((d as TopConsumerEntry).username)
					}
					className={onConsumerClick ? "cursor-pointer" : undefined}
				>
					{sorted.map((d) => (
						<Cell key={d.username} fill={CHART_TOKENS.c4} />
					))}
				</Bar>
			</BarChart>
		</ChartContainer>
	);
}
