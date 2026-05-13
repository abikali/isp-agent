"use client";

import { cn } from "@ui/lib";
import {
	ArrowDownIcon,
	ArrowUpIcon,
	type LucideIcon,
	MinusIcon,
} from "lucide-react";
import type { ReactNode } from "react";

export type MetricTone =
	| "default"
	| "info"
	| "success"
	| "warning"
	| "danger"
	| "purple"
	| "cyan";

const TONE_VALUE: Record<MetricTone, string> = {
	default: "text-foreground",
	info: "text-info",
	success: "text-success",
	warning: "text-warning",
	danger: "text-destructive",
	purple: "text-chart-4",
	cyan: "text-chart-5",
};

const TONE_ICON_BG: Record<MetricTone, string> = {
	default: "bg-muted text-muted-foreground",
	info: "bg-info/10 text-info",
	success: "bg-success/10 text-success",
	warning: "bg-warning/10 text-warning",
	danger: "bg-destructive/10 text-destructive",
	purple: "bg-chart-4/10 text-chart-4",
	cyan: "bg-chart-5/10 text-chart-5",
};

interface MetricCardProps {
	label: string;
	value: string | number;
	icon?: LucideIcon;
	tone?: MetricTone;
	hint?: ReactNode;
	delta?: {
		value: number;
		label?: string;
		invert?: boolean;
	};
	href?: string;
	onClick?: () => void;
	active?: boolean;
	trailing?: ReactNode;
}

function formatValue(v: string | number): string {
	if (typeof v === "number") {
		return v.toLocaleString();
	}
	return v;
}

function Delta({
	value,
	label,
	invert,
}: {
	value: number;
	label?: string;
	invert?: boolean;
}) {
	const isUp = value > 0;
	const isDown = value < 0;
	const isFlat = value === 0;
	const goodWhenUp = !invert;
	const positive = isUp ? goodWhenUp : isDown ? !goodWhenUp : null;

	const Icon = isFlat ? MinusIcon : isUp ? ArrowUpIcon : ArrowDownIcon;
	const tone =
		positive === true
			? "text-success"
			: positive === false
				? "text-destructive"
				: "text-muted-foreground";

	return (
		<span
			className={cn(
				"inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums",
				tone,
			)}
		>
			<Icon className="size-3" />
			{Math.abs(value)}
			{label ? <span className="ml-0.5 opacity-70">{label}</span> : null}
		</span>
	);
}

export function MetricCard({
	label,
	value,
	icon: Icon,
	tone = "default",
	hint,
	delta,
	href,
	onClick,
	active,
	trailing,
}: MetricCardProps) {
	const interactive = !!href || !!onClick;
	const content = (
		<div
			className={cn(
				"group relative flex h-full flex-col gap-1.5 rounded-md border border-border bg-card px-3 py-2.5 shadow-xs transition-colors",
				interactive &&
					"cursor-pointer hover:border-border-strong hover:bg-surface-subtle/60",
				active && "border-primary/60 bg-primary/5",
			)}
		>
			<div className="flex items-center justify-between gap-2">
				<div className="flex min-w-0 items-center gap-1.5">
					{Icon && (
						<div
							className={cn(
								"flex size-5 shrink-0 items-center justify-center rounded",
								TONE_ICON_BG[tone],
							)}
						>
							<Icon className="size-3" />
						</div>
					)}
					<span className="truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
						{label}
					</span>
				</div>
				{trailing}
			</div>
			<div className="flex items-baseline justify-between gap-2">
				<span
					className={cn(
						"truncate text-xl font-medium tabular-nums tracking-tight",
						TONE_VALUE[tone],
					)}
				>
					{formatValue(value)}
				</span>
				{delta && <Delta {...delta} />}
			</div>
			{hint && (
				<div className="truncate text-[11px] text-muted-foreground">
					{hint}
				</div>
			)}
		</div>
	);

	if (href) {
		return (
			<a href={href} className="block">
				{content}
			</a>
		);
	}
	if (onClick) {
		return (
			<button
				type="button"
				onClick={onClick}
				aria-pressed={active}
				className="block w-full text-left"
			>
				{content}
			</button>
		);
	}
	return content;
}

interface MetricStripProps {
	children: ReactNode;
	columns?: 2 | 3 | 4 | 5 | 6 | 7 | 8;
	className?: string;
}

const STRIP_COLS: Record<number, string> = {
	2: "grid-cols-2",
	3: "grid-cols-2 sm:grid-cols-3",
	4: "grid-cols-2 sm:grid-cols-4",
	5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
	6: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6",
	7: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7",
	8: "grid-cols-2 sm:grid-cols-4 lg:grid-cols-8",
};

export function MetricStrip({
	children,
	columns = 6,
	className,
}: MetricStripProps) {
	return (
		<div className={cn("grid gap-2", STRIP_COLS[columns], className)}>
			{children}
		</div>
	);
}

export function MetricCardSkeleton() {
	return (
		<div className="flex h-full flex-col gap-1.5 rounded-md border border-border bg-card px-3 py-2.5 shadow-xs">
			<div className="h-3 w-20 animate-pulse rounded bg-muted" />
			<div className="h-6 w-16 animate-pulse rounded bg-muted" />
		</div>
	);
}
