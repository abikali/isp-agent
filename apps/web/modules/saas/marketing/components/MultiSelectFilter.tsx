"use client";

import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Checkbox } from "@ui/components/checkbox";
import { Input } from "@ui/components/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@ui/components/popover";
import { ScrollArea } from "@ui/components/scroll-area";
import { cn } from "@ui/lib";
import { CheckIcon, ChevronsUpDownIcon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";

export interface MultiSelectOption {
	value: string;
	label: string;
	hint?: string;
}

interface MultiSelectFilterProps {
	options: MultiSelectOption[];
	value: string[];
	onChange: (value: string[]) => void;
	placeholder?: string;
	searchPlaceholder?: string;
	emptyMessage?: string;
	className?: string;
	disabled?: boolean;
	/** When true, surface a single chip showing the count instead of each picked label. */
	compact?: boolean;
}

/**
 * Multi-select dropdown with built-in search. Renders selected items as
 * removable chips inside the trigger when there are 1-3 picks; collapses
 * to a "N selected" badge above that threshold.
 */
export function MultiSelectFilter({
	options,
	value,
	onChange,
	placeholder = "Any",
	searchPlaceholder = "Search…",
	emptyMessage = "No matches",
	className,
	disabled,
	compact = false,
}: MultiSelectFilterProps) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) {
			return options;
		}
		return options.filter(
			(o) =>
				o.label.toLowerCase().includes(q) ||
				o.value.toLowerCase().includes(q),
		);
	}, [options, search]);

	const toggle = (v: string) => {
		if (value.includes(v)) {
			onChange(value.filter((x) => x !== v));
		} else {
			onChange([...value, v]);
		}
	};

	const remove = (v: string) => {
		onChange(value.filter((x) => x !== v));
	};

	const selectedLabels = useMemo(
		() =>
			value
				.map((v) => options.find((o) => o.value === v)?.label ?? v)
				.filter(Boolean),
		[value, options],
	);

	const showCompactBadge = compact || value.length > 3;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					disabled={disabled}
					className={cn(
						"min-h-9 w-full justify-between gap-2 px-3 font-normal",
						value.length === 0 && "text-muted-foreground",
						className,
					)}
				>
					{value.length === 0 ? (
						<span className="truncate">{placeholder}</span>
					) : showCompactBadge ? (
						<Badge variant="secondary" className="font-medium">
							{value.length} selected
						</Badge>
					) : (
						<div className="flex flex-wrap items-center gap-1">
							{selectedLabels.map((label, i) => (
								<Badge
									key={`${value[i]}`}
									variant="secondary"
									className="flex items-center gap-1 pr-1 font-normal"
								>
									<span className="truncate max-w-[120px]">
										{label}
									</span>
									<span
										title={`Remove ${label}`}
										onPointerDown={(e) => {
											// Stop the Popover from toggling on
											// click — we own this hit zone.
											e.preventDefault();
											e.stopPropagation();
											const v = value[i];
											if (v) {
												remove(v);
											}
										}}
										className="-mr-0.5 inline-flex size-4 cursor-pointer items-center justify-center rounded-sm hover:bg-foreground/10"
									>
										<XIcon className="size-3" />
									</span>
								</Badge>
							))}
						</div>
					)}
					<ChevronsUpDownIcon className="size-3.5 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				className="w-[min(360px,calc(100vw-2rem))] p-0"
				align="start"
			>
				<div className="border-b p-2">
					<Input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder={searchPlaceholder}
						className="h-8"
					/>
				</div>
				<ScrollArea className="max-h-64">
					<div className="p-1">
						{filtered.length === 0 ? (
							<p className="px-3 py-6 text-center text-sm text-muted-foreground">
								{emptyMessage}
							</p>
						) : (
							filtered.map((option) => {
								const checked = value.includes(option.value);
								return (
									<button
										type="button"
										key={option.value}
										onClick={() => toggle(option.value)}
										className={cn(
											"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
											checked && "bg-accent/50",
										)}
									>
										<Checkbox
											checked={checked}
											aria-hidden
											tabIndex={-1}
										/>
										<span className="flex-1 truncate">
											{option.label}
										</span>
										{option.hint && (
											<span className="text-xs text-muted-foreground">
												{option.hint}
											</span>
										)}
										{checked && (
											<CheckIcon className="size-3.5 text-primary" />
										)}
									</button>
								);
							})
						)}
					</div>
				</ScrollArea>
				{value.length > 0 && (
					<div className="flex items-center justify-between border-t p-2 text-xs text-muted-foreground">
						<span>{value.length} selected</span>
						<Button
							variant="ghost"
							size="sm"
							className="h-7 px-2 text-xs"
							onClick={() => onChange([])}
						>
							Clear
						</Button>
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}
