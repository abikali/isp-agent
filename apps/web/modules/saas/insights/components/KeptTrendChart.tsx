"use client";

import {
	CHART_TOKENS,
	formatCompactCurrency,
	formatCurrency,
} from "@shared/components/charts/chart-utils";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@ui/components/chart";
// react-doctor-disable-next-line react-doctor/prefer-dynamic-import -- recharts sub-components are config children read via child.type; @ui/components/chart already imports recharts statically
import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	ReferenceLine,
	XAxis,
	YAxis,
} from "recharts";

export interface KeptPoint {
	label: string;
	moneyIn: number;
	moneyOut: number;
	net: number;
}

const config = {
	net: { label: "Kept", color: CHART_TOKENS.c1 },
} satisfies ChartConfig;

/**
 * What was kept, month by month.
 *
 * Bars rather than a line: each month is a discrete result, not a continuous
 * measurement, and a bar crossing zero reads as "that month lost money" without
 * needing a legend. The zero line is drawn explicitly for the same reason.
 */
export function KeptTrendChart({
	data,
	height = 220,
}: {
	data: KeptPoint[];
	height?: number;
}) {
	return (
		<ChartContainer config={config} style={{ height }} className="w-full">
			<BarChart
				data={data}
				margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
			>
				<CartesianGrid
					vertical={false}
					stroke={CHART_TOKENS.grid}
					strokeDasharray="3 3"
				/>
				<XAxis
					dataKey="label"
					tickLine={false}
					axisLine={false}
					tickMargin={8}
					stroke={CHART_TOKENS.axis}
					fontSize={11}
				/>
				<YAxis
					tickLine={false}
					axisLine={false}
					width={52}
					stroke={CHART_TOKENS.axis}
					fontSize={11}
					tickFormatter={(v) => formatCompactCurrency(Number(v))}
				/>
				<ReferenceLine y={0} stroke={CHART_TOKENS.axis} />
				<ChartTooltip
					content={
						<ChartTooltipContent
							formatter={(value) => formatCurrency(Number(value))}
						/>
					}
				/>
				<Bar dataKey="net" radius={[3, 3, 0, 0]} maxBarSize={44}>
					{data.map((point) => (
						<Cell
							key={point.label}
							fill={
								point.net >= 0
									? "var(--success)"
									: "var(--destructive)"
							}
						/>
					))}
				</Bar>
			</BarChart>
		</ChartContainer>
	);
}
