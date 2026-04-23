"use client";

import { formatDate } from "@shared/lib/format";
import { Button } from "@ui/components/button";
import { Calendar } from "@ui/components/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@ui/components/popover";
import { cn } from "@ui/lib";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";

const RANGE_FORMAT: Intl.DateTimeFormatOptions = {
	day: "2-digit",
	month: "short",
	year: "numeric",
};

interface DateRangePickerProps {
	value?: DateRange;
	onChange?: (range: DateRange | undefined) => void;
	placeholder?: string;
	className?: string;
	disabled?: boolean;
}

export function DateRangePicker({
	value,
	onChange,
	placeholder = "Pick a date range",
	className,
	disabled,
}: DateRangePickerProps) {
	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					size="md"
					disabled={disabled}
					className={cn(
						"w-full justify-start text-left font-normal sm:w-[260px]",
						!value?.from && "text-muted-foreground",
						className,
					)}
				>
					<CalendarIcon className="mr-2 h-4 w-4" />
					{value?.from ? (
						value.to ? (
							<>
								{formatDate(value.from, RANGE_FORMAT)} -{" "}
								{formatDate(value.to, RANGE_FORMAT)}
							</>
						) : (
							formatDate(value.from, RANGE_FORMAT)
						)
					) : (
						<span>{placeholder}</span>
					)}
				</Button>
			</PopoverTrigger>
			<PopoverContent
				className="w-auto max-w-[calc(100vw-2rem)] p-0"
				align="start"
			>
				<Calendar
					mode="range"
					defaultMonth={value?.from}
					selected={value}
					onSelect={onChange}
					numberOfMonths={2}
					disabled={{ after: new Date() }}
				/>
			</PopoverContent>
		</Popover>
	);
}
