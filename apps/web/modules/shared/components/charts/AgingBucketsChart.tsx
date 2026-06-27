"use client";

import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@ui/components/chart";
// react-doctor-disable-next-line react-doctor/prefer-dynamic-import -- recharts already in client bundle via @ui/components/chart (ChartContainer); per-leaf lazy import wouldn't reduce bundle
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import { CHART_TOKENS, formatCurrency } from "./chart-utils";

export interface AgingBucket {
	label: string;
	count: number;
	amount: number;
}

interface AgingBucketsChartProps {
	data: AgingBucket[];
	currency?: string;
	height?: number;
	onBucketClick?: (label: string) => void;
}

const config = {
	amount: { label: "Outstanding", color: CHART_TOKENS.c3 },
} satisfies ChartConfig;

const BUCKET_COLORS = [
	CHART_TOKENS.c2,
	CHART_TOKENS.c3,
	"hsl(20 90% 55%)",
	"hsl(0 75% 55%)",
];

export function AgingBucketsChart({
	data,
	currency = "USD",
	height = 220,
	onBucketClick,
}: AgingBucketsChartProps) {
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
					dataKey="label"
					stroke={CHART_TOKENS.axis}
					tickLine={false}
					axisLine={false}
					fontSize={11}
				/>
				<YAxis
					tickFormatter={(v) => formatCurrency(v, currency)}
					stroke={CHART_TOKENS.axis}
					tickLine={false}
					axisLine={false}
					fontSize={11}
					width={56}
				/>
				<ChartTooltip
					content={
						<ChartTooltipContent
							formatter={(value, _name, item) => [
								`${formatCurrency(Number(value), currency)} (${item.payload.count} customers)`,
								"Outstanding",
							]}
						/>
					}
				/>
				<Bar
					dataKey="amount"
					radius={[4, 4, 0, 0]}
					isAnimationActive
					animationDuration={320}
					onClick={(d) => onBucketClick?.(d.label)}
					className={onBucketClick ? "cursor-pointer" : undefined}
				>
					{data.map((d, i) => (
						<Cell
							key={d.label}
							fill={BUCKET_COLORS[i] ?? CHART_TOKENS.c3}
						/>
					))}
				</Bar>
			</BarChart>
		</ChartContainer>
	);
}
