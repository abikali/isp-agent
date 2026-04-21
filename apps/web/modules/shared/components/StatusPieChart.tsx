"use client";

import { ChartCard } from "@shared/components/ChartCard";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export const TOOLTIP_STYLE = {
	borderRadius: "8px",
	border: "1px solid var(--color-border)",
	background: "var(--color-card)",
	color: "var(--color-foreground)",
	fontSize: "12px",
};

interface StatusPieChartProps {
	title: string;
	data: Array<{ name: string; value: number }>;
	colorMap: Record<string, string>;
	footer?: string;
	size?: "sm" | "lg";
}

export function StatusPieChart({
	title,
	data,
	colorMap,
	footer,
	size = "sm",
}: StatusPieChartProps) {
	const sizeClass = size === "lg" ? "h-36 w-36" : "h-32 w-32";
	const innerRadius = size === "lg" ? 36 : 30;
	const outerRadius = size === "lg" ? 56 : 50;

	return (
		<ChartCard title={title}>
			<div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
				<div className={`${sizeClass} shrink-0`}>
					<ResponsiveContainer width="100%" height="100%">
						<PieChart>
							<Pie
								data={data}
								cx="50%"
								cy="50%"
								innerRadius={innerRadius}
								outerRadius={outerRadius}
								paddingAngle={3}
								dataKey="value"
								stroke="none"
							>
								{data.map((entry) => (
									<Cell
										key={entry.name}
										fill={
											colorMap[entry.name] ??
											"var(--color-chart-1)"
										}
									/>
								))}
							</Pie>
							<Tooltip contentStyle={TOOLTIP_STYLE} />
						</PieChart>
					</ResponsiveContainer>
				</div>
				<div className="space-y-2 text-sm">
					{data.map((item) => (
						<div
							key={item.name}
							className="flex items-center gap-2"
						>
							<div
								className="size-2.5 rounded-full"
								style={{
									backgroundColor:
										colorMap[item.name] ??
										"var(--color-chart-1)",
								}}
							/>
							<span className="text-muted-foreground">
								{item.name}
							</span>
							<span className="ml-auto font-semibold tabular-nums">
								{item.value.toLocaleString()}
							</span>
						</div>
					))}
					{footer && (
						<div className="border-t pt-2 text-xs text-muted-foreground">
							{footer}
						</div>
					)}
				</div>
			</div>
		</ChartCard>
	);
}
