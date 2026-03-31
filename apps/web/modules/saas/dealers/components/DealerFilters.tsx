"use client";

import { FilterBar } from "@shared/components/FilterBar";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { DEALER_STATUS_OPTIONS } from "../lib/constants";

interface DealerFiltersProps {
	search: string;
	onSearchChange: (value: string) => void;
	status: string;
	onStatusChange: (value: string) => void;
}

export function DealerFilters({
	search,
	onSearchChange,
	status,
	onStatusChange,
}: DealerFiltersProps) {
	const activeCount = status !== "all" ? 1 : 0;

	return (
		<FilterBar
			searchPlaceholder="Search dealers..."
			searchValue={search}
			onSearchChange={onSearchChange}
			activeFilterCount={activeCount}
			onReset={() => onStatusChange("all")}
		>
			<Select value={status} onValueChange={onStatusChange}>
				<SelectTrigger className="w-full sm:w-[140px]">
					<SelectValue placeholder="Status" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All Status</SelectItem>
					{DEALER_STATUS_OPTIONS.map((opt) => (
						<SelectItem key={opt.value} value={opt.value}>
							{opt.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</FilterBar>
	);
}
