"use client";

import { cn } from "@ui/lib";
import { CHART_TOKENS, formatNumber, formatPercent } from "./chart-utils";

export interface FunnelStep {
	label: string;
	value: number;
}

interface DeliveryFunnelProps {
	steps: FunnelStep[];
	className?: string;
}

const COLORS = [
	CHART_TOKENS.c1,
	CHART_TOKENS.c5,
	CHART_TOKENS.c2,
	CHART_TOKENS.c3,
];

export function DeliveryFunnel({ steps, className }: DeliveryFunnelProps) {
	const max = Math.max(...steps.map((s) => s.value), 1);

	return (
		<div className={cn("space-y-2", className)}>
			{steps.map((step, i) => {
				const widthPct = (step.value / max) * 100;
				const prev = i > 0 ? steps[i - 1] : undefined;
				const conversion =
					prev && prev.value > 0
						? (step.value / prev.value) * 100
						: null;
				return (
					<div key={step.label} className="space-y-1">
						<div className="flex items-center justify-between text-[11px]">
							<span className="font-medium text-foreground">
								{step.label}
							</span>
							<span className="tabular-nums text-muted-foreground">
								{formatNumber(step.value)}
								{conversion != null && (
									<span className="ml-2 text-foreground/70">
										{formatPercent(conversion)}
									</span>
								)}
							</span>
						</div>
						<div className="h-7 overflow-hidden rounded-md bg-muted/40">
							<div
								className="h-full rounded-md transition-all duration-300"
								style={{
									width: `${widthPct}%`,
									backgroundColor:
										COLORS[i % COLORS.length] ??
										CHART_TOKENS.c1,
								}}
							/>
						</div>
					</div>
				);
			})}
		</div>
	);
}
