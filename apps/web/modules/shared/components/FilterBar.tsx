"use client";

import { SearchInput } from "@shared/components/SearchInput";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { cn } from "@ui/lib";
import { FilterIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";

interface FilterBarProps {
	searchPlaceholder?: string;
	searchValue: string;
	onSearchChange: (value: string) => void;
	searchHint?: string;
	children?: ReactNode;
	activeFilterCount?: number;
	onReset?: () => void;
	/** Optional content rendered below the row (e.g. active filter chips). */
	belowSlot?: ReactNode;
	className?: string;
}

export function FilterBar({
	searchPlaceholder = "Search...",
	searchValue,
	onSearchChange,
	searchHint,
	children,
	activeFilterCount = 0,
	onReset,
	belowSlot,
	className,
}: FilterBarProps) {
	const hasFilters = !!children;
	const hasActive = activeFilterCount > 0;

	return (
		<div className={cn("rounded-xl border bg-card shadow-card", className)}>
			<div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
				<SearchInput
					placeholder={searchPlaceholder}
					value={searchValue}
					onChange={onSearchChange}
					hint={searchHint}
				/>

				{hasFilters && (
					<>
						<div className="hidden h-6 w-px shrink-0 bg-border sm:block" />
						<div className="flex flex-1 flex-wrap items-center gap-2">
							<div
								className="hidden items-center gap-1.5 text-xs font-medium text-muted-foreground md:inline-flex"
								aria-hidden
							>
								<FilterIcon className="size-3.5" />
								Filters
							</div>
							{children}
						</div>
					</>
				)}

				{hasActive && onReset && (
					<Button
						variant="ghost"
						size="sm"
						onClick={onReset}
						className="text-muted-foreground hover:text-foreground"
					>
						<XIcon className="mr-1 size-3.5" />
						Clear
						<Badge variant="secondary" className="ml-1.5">
							{activeFilterCount}
						</Badge>
					</Button>
				)}
			</div>

			{belowSlot && <div className="border-t px-3 py-2">{belowSlot}</div>}
		</div>
	);
}
