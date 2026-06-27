"use client";

import {
	type ChartConfig,
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
	ChartTooltipContent,
} from "@ui/components/chart";
// react-doctor-disable-next-line react-doctor/prefer-dynamic-import -- recharts already in client bundle via @ui/components/chart (ChartContainer); per-leaf lazy import wouldn't reduce bundle
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { CHART_TOKENS, formatBytes, formatShortDate } from "./chart-utils";

export interface BandwidthPoint {
	date: string;
	download: number;
	upload: number;
}

interface BandwidthChartProps {
	data: BandwidthPoint[];
	height?: number;
}

const config = {
	download: { label: "Download", color: CHART_TOKENS.c1 },
	upload: { label: "Upload", color: CHART_TOKENS.c4 },
} satisfies ChartConfig;

export function BandwidthChart({ data, height = 220 }: BandwidthChartProps) {
	return (
		<ChartContainer config={config} style={{ height }} className="w-full">
			<AreaChart
				data={data}
				margin={{ left: 4, right: 4, top: 8, bottom: 0 }}
			>
				<defs>
					<linearGradient id="dlFill" x1="0" y1="0" x2="0" y2="1">
						<stop
							offset="0%"
							stopColor={CHART_TOKENS.c1}
							stopOpacity={0.3}
						/>
						<stop
							offset="100%"
							stopColor={CHART_TOKENS.c1}
							stopOpacity={0}
						/>
					</linearGradient>
					<linearGradient id="ulFill" x1="0" y1="0" x2="0" y2="1">
						<stop
							offset="0%"
							stopColor={CHART_TOKENS.c4}
							stopOpacity={0.3}
						/>
						<stop
							offset="100%"
							stopColor={CHART_TOKENS.c4}
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
					tickFormatter={(v) => formatBytes(v)}
					stroke={CHART_TOKENS.axis}
					tickLine={false}
					axisLine={false}
					fontSize={11}
					width={64}
				/>
				<ChartTooltip
					content={
						<ChartTooltipContent
							labelFormatter={(v) => formatShortDate(v)}
							formatter={(value, name) => [
								` ${formatBytes(Number(value))}`,
								name === "download" ? "Download" : "Upload",
							]}
						/>
					}
				/>
				<ChartLegend content={<ChartLegendContent />} />
				<Area
					type="monotone"
					dataKey="download"
					stroke={CHART_TOKENS.c1}
					strokeWidth={2}
					fill="url(#dlFill)"
					isAnimationActive
					animationDuration={320}
				/>
				<Area
					type="monotone"
					dataKey="upload"
					stroke={CHART_TOKENS.c4}
					strokeWidth={2}
					fill="url(#ulFill)"
					isAnimationActive
					animationDuration={320}
				/>
			</AreaChart>
		</ChartContainer>
	);
}
