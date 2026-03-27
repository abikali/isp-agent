"use client";

import { SearchInput } from "@shared/components/SearchInput";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { XIcon } from "lucide-react";
import type { ReactNode } from "react";

interface FilterBarProps {
	searchPlaceholder?: string;
	searchValue: string;
	onSearchChange: (value: string) => void;
	children?: ReactNode;
	activeFilterCount?: number;
	onReset?: () => void;
}

export function FilterBar({
	searchPlaceholder = "Search...",
	searchValue,
	onSearchChange,
	children,
	activeFilterCount = 0,
	onReset,
}: FilterBarProps) {
	return (
		<div className="flex flex-wrap items-center gap-3 rounded-xl bg-card p-3 shadow-card">
			<SearchInput
				placeholder={searchPlaceholder}
				value={searchValue}
				onChange={onSearchChange}
			/>
			{children}
			{activeFilterCount > 0 && onReset && (
				<Button
					variant="ghost"
					size="sm"
					onClick={onReset}
					className="text-muted-foreground"
				>
					<XIcon className="mr-1 size-3" />
					Clear
					<Badge variant="secondary" className="ml-1.5">
						{activeFilterCount}
					</Badge>
				</Button>
			)}
		</div>
	);
}
