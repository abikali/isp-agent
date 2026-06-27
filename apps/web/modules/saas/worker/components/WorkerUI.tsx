"use client";

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
	SearchIcon,
	XIcon,
} from "lucide-react";

export interface StatItem {
	label: string;
	value: string;
	hint?: string;
}

/** Responsive current-month KPI strip shown at the top of each tab. */
export function StatStrip({
	items,
	isLoading = false,
}: {
	items: StatItem[];
	isLoading?: boolean;
}) {
	if (isLoading) {
		return (
			<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
				{items.map((item) => (
					<Skeleton
						key={item.label}
						className="h-[68px] rounded-lg"
					/>
				))}
			</div>
		);
	}
	return (
		<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
			{items.map((item) => (
				<Card key={item.label}>
					<CardContent className="p-3">
						<p className="truncate text-[11px] text-muted-foreground">
							{item.label}
						</p>
						<p className="mt-0.5 font-semibold text-lg tabular-nums">
							{item.value}
						</p>
						{item.hint ? (
							<p className="truncate text-[11px] text-muted-foreground">
								{item.hint}
							</p>
						) : null}
					</CardContent>
				</Card>
			))}
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
