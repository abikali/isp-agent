"use client";

import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@ui/components/chart";
import { Cell, Label, Pie, PieChart } from "recharts";
import { CHART_TOKENS, formatCompactCurrency } from "./chart-utils";

export interface PaymentMethodSlice {
	method: string;
	amount: number;
}

interface PaymentMethodDonutProps {
	data: PaymentMethodSlice[];
	currency?: string;
	height?: number;
}

const PALETTE = [
	CHART_TOKENS.c1,
	CHART_TOKENS.c2,
	CHART_TOKENS.c4,
	CHART_TOKENS.c5,
	CHART_TOKENS.c3,
	CHART_TOKENS.c6,
];

const config = {
	amount: { label: "Amount" },
} satisfies ChartConfig;

export function PaymentMethodDonut({
	data,
	currency = "USD",
	height = 220,
}: PaymentMethodDonutProps) {
	const total = data.reduce((sum, s) => sum + s.amount, 0);

	return (
		<ChartContainer config={config} style={{ height }} className="w-full">
			<PieChart>
				<ChartTooltip
					content={
						<ChartTooltipContent
							formatter={(value, _name, item) => [
								` ${formatCompactCurrency(Number(value), currency)}`,
								item.payload.method,
							]}
							hideLabel
						/>
					}
				/>
				<Pie
					data={data}
					dataKey="amount"
					nameKey="method"
					innerRadius="55%"
					outerRadius="80%"
					paddingAngle={2}
					stroke="var(--card)"
					strokeWidth={2}
					isAnimationActive
					animationDuration={320}
				>
					{data.map((d, i) => (
						<Cell
							key={d.method}
							fill={
								PALETTE[i % PALETTE.length] ?? CHART_TOKENS.c1
							}
						/>
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
										className="fill-foreground text-base font-medium tabular-nums"
									>
										{formatCompactCurrency(total, currency)}
									</tspan>
									<tspan
										x={viewBox.cx}
										dy="1.4em"
										className="fill-muted-foreground text-[10px] uppercase tracking-wider"
									>
										Total
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
