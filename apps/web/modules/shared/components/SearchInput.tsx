"use client";

import { Input } from "@ui/components/input";
import { cn } from "@ui/lib";
import { SearchIcon, XIcon } from "lucide-react";

interface SearchInputProps {
	placeholder?: string;
	value: string;
	onChange: (value: string) => void;
	className?: string;
	hint?: string;
}

export function SearchInput({
	placeholder = "Search...",
	value,
	onChange,
	className,
	hint,
}: SearchInputProps) {
	return (
		<div
			className={cn(
				"relative w-full flex-1 sm:min-w-[240px] sm:max-w-md",
				className,
			)}
		>
			<SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
			<Input
				placeholder={placeholder}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className={cn("pl-9", value && "pr-9")}
				aria-label={placeholder}
				title={hint}
			/>
			{value && (
				<button
					type="button"
					onClick={() => onChange("")}
					className="absolute right-2 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					aria-label="Clear search"
				>
					<XIcon className="size-3.5" />
				</button>
			)}
		</div>
	);
}
