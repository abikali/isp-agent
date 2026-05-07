"use client";

import type { VisibilityState } from "@tanstack/react-table";
import { Button } from "@ui/components/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@ui/components/dropdown-menu";
import { SlidersHorizontalIcon } from "lucide-react";

interface TableColumn {
	id: string;
	label: string;
	/** When true, the column is locked visible and not shown in the toggle list. */
	alwaysVisible?: boolean;
}

interface TableColumnsToggleProps {
	columns: TableColumn[];
	value: VisibilityState;
	onChange: (next: VisibilityState) => void;
	/** Override the trigger label (default: "Columns"). */
	label?: string;
}

export function TableColumnsToggle({
	columns,
	value,
	onChange,
	label = "Columns",
}: TableColumnsToggleProps) {
	const toggleable = columns.filter((c) => !c.alwaysVisible);
	if (toggleable.length === 0) {
		return null;
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm">
					<SlidersHorizontalIcon className="mr-1.5 size-3.5" />
					{label}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-48">
				<DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{toggleable.map((col) => {
					const isVisible = value[col.id] !== false;
					return (
						<DropdownMenuCheckboxItem
							key={col.id}
							checked={isVisible}
							onCheckedChange={(checked) =>
								onChange({ ...value, [col.id]: !!checked })
							}
						>
							{col.label}
						</DropdownMenuCheckboxItem>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
