"use client";

import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@ui/components/chart";
import { Bar, BarChart, Cell, XAxis, YAxis } from "recharts";
import {
	CHART_TOKENS,
	formatCompactCurrency,
	formatCurrency,
} from "./chart-utils";

export interface CollectorEntry {
	collectorId: string;
	name: string;
	amount: number;
	count?: number;
}

interface CollectorLeaderboardProps {
	data: CollectorEntry[];
	currency?: string;
	height?: number;
	onCollectorClick?: (collectorId: string) => void;
}

const config = {
	amount: { label: "Collected", color: CHART_TOKENS.c1 },
} satisfies ChartConfig;

export function CollectorLeaderboard({
	data,
	currency = "USD",
	height = 280,
	onCollectorClick,
}: CollectorLeaderboardProps) {
	const sorted = [...data].sort((a, b) => b.amount - a.amount).slice(0, 10);

	return (
		<ChartContainer config={config} style={{ height }} className="w-full">
			<BarChart
				layout="vertical"
				data={sorted}
				margin={{ left: 0, right: 16, top: 4, bottom: 4 }}
			>
				<XAxis
					type="number"
					tickFormatter={(v) => formatCompactCurrency(v, currency)}
					stroke={CHART_TOKENS.axis}
					tickLine={false}
					axisLine={false}
					fontSize={11}
				/>
				<YAxis
					type="category"
					dataKey="name"
					stroke={CHART_TOKENS.axis}
					tickLine={false}
					axisLine={false}
					fontSize={11}
					width={110}
				/>
				<ChartTooltip
					content={
						<ChartTooltipContent
							formatter={(value, _name, item) => [
								` ${formatCurrency(Number(value), currency)}${item.payload.count != null ? ` (${item.payload.count})` : ""}`,
								"Collected",
							]}
							hideLabel
						/>
					}
				/>
				<Bar
					dataKey="amount"
					radius={[0, 4, 4, 0]}
					isAnimationActive
					animationDuration={320}
					onClick={(d) =>
						onCollectorClick?.((d as CollectorEntry).collectorId)
					}
					className={onCollectorClick ? "cursor-pointer" : undefined}
				>
					{sorted.map((d) => (
						<Cell key={d.collectorId} fill={CHART_TOKENS.c1} />
					))}
				</Bar>
			</BarChart>
		</ChartContainer>
	);
}
