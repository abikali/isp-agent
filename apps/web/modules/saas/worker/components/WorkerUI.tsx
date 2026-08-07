"use client";

import { formatDate, formatTime, getBeirutDate } from "@shared/lib/format";
import { Button } from "@ui/components/button";
import { Card, CardContent } from "@ui/components/card";
import { Input } from "@ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { Skeleton } from "@ui/components/skeleton";
import { cn } from "@ui/lib";
import {
	ChevronLeftIcon,
	ChevronRightIcon,
	type LucideIcon,
	SearchIcon,
	XIcon,
} from "lucide-react";

/**
 * Whole-day count since the Unix epoch for a date, evaluated in Beirut time.
 * Lets us compare calendar days (Today / Yesterday) without TZ drift.
 */
function beirutDayNumber(value: Date): number {
	const { year, month, day } = getBeirutDate(value);
	return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

/**
 * Human, glanceable timestamp for the field portal: "Today · 14:30",
 * "Yesterday · 09:12", "Mon · 16:05" (this week), else "28 Jun". Always shows
 * the time for same-week entries so a worker can tell *when* something happened.
 * Beirut timezone, matching the rest of the app's date display.
 */
// react-doctor-disable-next-line react-doctor/only-export-components -- formatWhen is a display helper cohesive with the worker-portal UI primitives in this file; moving it would churn imports for no gain
export function formatWhen(value: Date | string): string {
	const date = typeof value === "string" ? new Date(value) : value;
	const diff = beirutDayNumber(new Date()) - beirutDayNumber(date);
	const time = formatTime(date, { hour: "2-digit", minute: "2-digit" });
	if (diff <= 0) {
		return `Today · ${time}`;
	}
	if (diff === 1) {
		return `Yesterday · ${time}`;
	}
	if (diff < 7) {
		return `${formatDate(date, { weekday: "short" })} · ${time}`;
	}
	return formatDate(date, { day: "numeric", month: "short" });
}

/** Small section heading with optional icon and trailing action/aside. */
export function SectionHeader({
	icon: Icon,
	title,
	action,
}: {
	icon?: LucideIcon;
	title: string;
	action?: React.ReactNode;
}) {
	return (
		<div className="flex items-center justify-between gap-2">
			<p className="flex items-center gap-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
				{Icon ? <Icon className="size-3.5" /> : null}
				{title}
			</p>
			{action}
		</div>
	);
}

const STAT_TONE: Record<string, string> = {
	default: "text-foreground",
	positive: "text-emerald-600",
	negative: "text-destructive",
	warning: "text-amber-600",
};

export interface StatItem {
	label: string;
	value: string;
	hint?: string;
	icon?: LucideIcon;
	tone?: "default" | "positive" | "negative" | "warning";
}

/** Responsive current-month KPI strip shown at the top of each tab. */
export function StatStrip({
	items,
	isLoading = false,
	columns = 4,
}: {
	items: StatItem[];
	isLoading?: boolean;
	columns?: 2 | 3 | 4;
}) {
	const gridCols =
		columns === 2
			? "grid-cols-2"
			: columns === 3
				? "grid-cols-3"
				: "grid-cols-2 sm:grid-cols-4";
	if (isLoading) {
		return (
			<div className={cn("grid gap-2", gridCols)}>
				{items.map((item) => (
					<Skeleton
						key={item.label}
						className="h-[72px] rounded-lg"
					/>
				))}
			</div>
		);
	}
	return (
		<div className={cn("grid gap-2", gridCols)}>
			{items.map((item) => {
				const Icon = item.icon;
				return (
					<Card key={item.label}>
						<CardContent className="p-3">
							<p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
								{Icon ? (
									<Icon className="size-3 shrink-0" />
								) : null}
								<span className="truncate">{item.label}</span>
							</p>
							<p
								className={cn(
									"mt-0.5 font-semibold text-lg tabular-nums",
									STAT_TONE[item.tone ?? "default"],
								)}
							>
								{item.value}
							</p>
							{item.hint ? (
								<p className="truncate text-[11px] text-muted-foreground">
									{item.hint}
								</p>
							) : null}
						</CardContent>
					</Card>
				);
			})}
		</div>
	);
}

/** Debounce-friendly search box (controlled); caller debounces before querying. */
// react-doctor-disable-next-line react-doctor/no-multi-comp -- cohesive worker-portal UI primitives barrel
export function SearchBar({
	value,
	onChange,
	placeholder = "Search…",
}: {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
}) {
	return (
		<div className="relative flex-1">
			<SearchIcon className="-translate-y-1/2 absolute top-1/2 left-2.5 size-4 text-muted-foreground" />
			<Input
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				className="pr-8 pl-8"
				inputMode="search"
			/>
			{value ? (
				<button
					type="button"
					onClick={() => onChange("")}
					aria-label="Clear search"
					className="-translate-y-1/2 absolute top-1/2 right-2 text-muted-foreground hover:text-foreground"
				>
					<XIcon className="size-4" />
				</button>
			) : null}
		</div>
	);
}

export interface SelectOption {
	value: string;
	label: string;
}

/** Compact dropdown filter/sort control. */
// react-doctor-disable-next-line react-doctor/no-multi-comp -- cohesive worker-portal UI primitives barrel
export function SelectControl({
	value,
	onChange,
	options,
	ariaLabel,
	className,
}: {
	value: string;
	onChange: (value: string) => void;
	options: SelectOption[];
	ariaLabel: string;
	className?: string;
}) {
	return (
		<Select value={value} onValueChange={onChange}>
			<SelectTrigger
				className={cn("h-9 w-auto min-w-[7rem]", className)}
				aria-label={ariaLabel}
			>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{options.map((opt) => (
					<SelectItem key={opt.value} value={opt.value}>
						{opt.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

/** Prev / page-indicator / Next pager. Renders nothing for a single page. */
// react-doctor-disable-next-line react-doctor/no-multi-comp -- cohesive worker-portal UI primitives barrel
export function Pager({
	page,
	totalPages,
	onPageChange,
	isFetching = false,
}: {
	page: number;
	totalPages: number;
	onPageChange: (page: number) => void;
	isFetching?: boolean;
}) {
	if (totalPages <= 1) {
		return null;
	}
	return (
		<div className="flex items-center justify-between pt-1">
			<Button
				variant="outline"
				size="sm"
				disabled={page <= 1 || isFetching}
				onClick={() => onPageChange(page - 1)}
			>
				<ChevronLeftIcon className="mr-1 size-4" />
				Prev
			</Button>
			<span className="text-muted-foreground text-xs tabular-nums">
				Page {page} of {totalPages}
			</span>
			<Button
				variant="outline"
				size="sm"
				disabled={page >= totalPages || isFetching}
				onClick={() => onPageChange(page + 1)}
			>
				Next
				<ChevronRightIcon className="ml-1 size-4" />
			</Button>
		</div>
	);
}
