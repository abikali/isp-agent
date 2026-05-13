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

const TONE_ACCENT: Record<MetricTone, string> = {
	default:
		"bg-[radial-gradient(ellipse_at_top_right,var(--muted)/0.5,transparent_60%)]",
	info: "bg-[radial-gradient(ellipse_at_top_right,color-mix(in_oklch,var(--info)_18%,transparent),transparent_60%)]",
	success:
		"bg-[radial-gradient(ellipse_at_top_right,color-mix(in_oklch,var(--success)_18%,transparent),transparent_60%)]",
	warning:
		"bg-[radial-gradient(ellipse_at_top_right,color-mix(in_oklch,var(--warning)_18%,transparent),transparent_60%)]",
	danger: "bg-[radial-gradient(ellipse_at_top_right,color-mix(in_oklch,var(--destructive)_18%,transparent),transparent_60%)]",
	purple: "bg-[radial-gradient(ellipse_at_top_right,color-mix(in_oklch,var(--chart-4)_18%,transparent),transparent_60%)]",
	cyan: "bg-[radial-gradient(ellipse_at_top_right,color-mix(in_oklch,var(--chart-5)_18%,transparent),transparent_60%)]",
};

const TONE_ICON: Record<MetricTone, string> = {
	default: "text-muted-foreground",
	info: "text-info",
	success: "text-success",
	warning: "text-warning",
	danger: "text-destructive",
	purple: "text-chart-4",
	cyan: "text-chart-5",
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
	/** Pass a small sparkline / inline chart at the bottom of the card. */
	footer?: ReactNode;
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
			? "text-success bg-success/10"
			: positive === false
				? "text-destructive bg-destructive/10"
				: "text-muted-foreground bg-muted";

	return (
		<span
			className={cn(
				"inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium tabular-nums",
				tone,
			)}
		>
			<Icon className="size-2.5" />
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
	footer,
}: MetricCardProps) {
	const interactive = !!href || !!onClick;
	const content = (
		<div
			className={cn(
				"group relative isolate flex h-full flex-col justify-between overflow-hidden rounded-lg border border-border bg-card px-3.5 py-3 shadow-xs transition-all",
				interactive &&
					"cursor-pointer hover:-translate-y-px hover:border-border-strong hover:shadow-sm",
				active && "border-primary/50 ring-1 ring-primary/20 ring-inset",
			)}
		>
			{/* Tone wash — subtle radial accent that gives each card visual character */}
			{tone !== "default" && (
				<div
					className={cn(
						"pointer-events-none absolute inset-0 -z-10 transition-opacity group-hover:opacity-100",
						TONE_ACCENT[tone],
						"opacity-70",
					)}
					aria-hidden
				/>
			)}

			{/* Top row: label + icon */}
			<div className="flex items-start justify-between gap-2">
				<span className="truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
					{label}
				</span>
				{Icon ? (
					<Icon
						className={cn("size-3.5 shrink-0", TONE_ICON[tone])}
						aria-hidden
					/>
				) : (
					trailing
				)}
			</div>

			{/* Middle: value + delta */}
			<div className="mt-1.5 flex items-baseline gap-2">
				<span
					className={cn(
						"truncate text-2xl font-semibold tabular-nums leading-none tracking-tight",
						TONE_VALUE[tone],
					)}
				>
					{formatValue(value)}
				</span>
				{delta && <Delta {...delta} />}
			</div>

			{/* Bottom: hint + footer */}
			{(hint || footer) && (
				<div className="mt-2 space-y-1">
					{footer}
					{hint && (
						<div className="truncate text-[11px] text-muted-foreground/80">
							{hint}
						</div>
					)}
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
		<div className="flex h-full flex-col justify-between gap-3 rounded-lg border border-border bg-card px-3.5 py-3 shadow-xs">
			<div className="h-3 w-20 animate-pulse rounded bg-muted" />
			<div className="h-7 w-16 animate-pulse rounded bg-muted" />
			<div className="h-2.5 w-24 animate-pulse rounded bg-muted/60" />
		</div>
	);
}
