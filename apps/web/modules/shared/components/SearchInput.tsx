"use client";

import { Input } from "@ui/components/input";
import { cn } from "@ui/lib";
import { SearchIcon } from "lucide-react";

interface SearchInputProps {
	placeholder?: string;
	value: string;
	onChange: (value: string) => void;
	className?: string;
}

export function SearchInput({
	placeholder = "Search...",
	value,
	onChange,
	className,
}: SearchInputProps) {
	return (
		<div
			className={cn(
				"relative w-full flex-1 sm:min-w-[200px] sm:max-w-xs",
				className,
			)}
		>
			<SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
			<Input
				placeholder={placeholder}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className="pl-9"
			/>
		</div>
	);
}
