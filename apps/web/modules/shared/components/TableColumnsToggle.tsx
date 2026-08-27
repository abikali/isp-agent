"use client";

import type { VisibilityState } from "@tanstack/react-table";
import { Button } from "@ui/components/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@ui/components/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@ui/components/popover";
import { cn } from "@ui/lib";
import { CheckIcon, SlidersHorizontalIcon } from "lucide-react";

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

/**
 * Column picker built on Popover + cmdk, the same stack as `Combobox`: cmdk
 * owns the filter box, arrow-key navigation, Enter-to-toggle and the empty
 * state, so long column lists (customers has a dozen) are type-to-find for
 * free. Items stay open on select so several columns can be toggled in a row.
 */
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
		<Popover>
			<PopoverTrigger asChild>
				<Button variant="outline" size="sm">
					<SlidersHorizontalIcon className="mr-1.5 size-3.5" />
					{label}
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-56 p-0">
				<Command>
					<CommandInput placeholder="Search columns…" />
					<CommandList>
						<CommandEmpty>No columns found</CommandEmpty>
						<CommandGroup heading="Toggle columns">
							{toggleable.map((col) => {
								const isVisible = value[col.id] !== false;
								return (
									<CommandItem
										key={col.id}
										value={col.id}
										keywords={[col.label]}
										onSelect={() =>
											onChange({
												...value,
												[col.id]: !isVisible,
											})
										}
									>
										<CheckIcon
											className={cn(
												"size-4 shrink-0",
												isVisible
													? "opacity-100"
													: "opacity-0",
											)}
										/>
										<span className="truncate">
											{col.label}
										</span>
									</CommandItem>
								);
							})}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
