"use client";

import { cn } from "@ui/lib";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type * as React from "react";
import { DayPicker } from "react-day-picker";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
	className,
	classNames,
	showOutsideDays = true,
	...props
}: CalendarProps) {
	return (
		<DayPicker
			showOutsideDays={showOutsideDays}
			className={cn("p-3", className)}
			classNames={{
				months: "flex flex-col sm:flex-row gap-2",
				month: "flex flex-col gap-4",
				month_caption:
					"flex justify-center pt-1 relative items-center w-full",
				caption_label: "text-sm font-medium",
				nav: "flex items-center gap-1",
				button_previous: cn(
					"absolute left-1 top-0 z-10 flex h-7 w-7 items-center justify-center rounded-md border bg-transparent p-0 opacity-50 hover:opacity-100 transition-opacity",
				),
				button_next: cn(
					"absolute right-1 top-0 z-10 flex h-7 w-7 items-center justify-center rounded-md border bg-transparent p-0 opacity-50 hover:opacity-100 transition-opacity",
				),
				month_grid: "w-full border-collapse space-x-1",
				weekdays: "flex",
				weekday:
					"text-muted-foreground rounded-md w-8 font-normal text-[0.8rem]",
				week: "flex w-full mt-2",
				day: cn(
					"relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50",
					props.mode === "range"
						? "[&:has(>.day-range-end)]:rounded-r-md [&:has(>.day-range-start)]:rounded-l-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md"
						: "[&:has([aria-selected])]:rounded-md",
				),
				day_button: cn(
					"h-8 w-8 p-0 font-normal rounded-md transition-colors",
					"hover:bg-accent hover:text-accent-foreground",
					"focus:bg-accent focus:text-accent-foreground focus:outline-none",
					"aria-selected:opacity-100",
				),
				range_start:
					"day-range-start rounded-l-md bg-primary text-primary-foreground",
				range_end:
					"day-range-end rounded-r-md bg-primary text-primary-foreground",
				selected:
					"bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
				today: "bg-accent text-accent-foreground",
				outside:
					"day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
				disabled: "text-muted-foreground opacity-50",
				range_middle:
					"aria-selected:bg-accent aria-selected:text-accent-foreground",
				hidden: "invisible",
				...classNames,
			}}
			components={{
				Chevron: ({ orientation }) =>
					orientation === "left" ? (
						<ChevronLeftIcon className="h-4 w-4" />
					) : (
						<ChevronRightIcon className="h-4 w-4" />
					),
			}}
			{...props}
		/>
	);
}
Calendar.displayName = "Calendar";

export { Calendar };
