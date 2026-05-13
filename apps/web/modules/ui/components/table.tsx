import { cn } from "@ui/lib";
import * as React from "react";

const Table = ({
	className,
	...props
}: React.HTMLAttributes<HTMLTableElement>) => (
	<div className="w-full overflow-auto">
		<table
			className={cn("w-full caption-bottom text-sm", className)}
			{...props}
		/>
	</div>
);

const TableHeader = ({
	className,
	...props
}: React.HTMLAttributes<HTMLTableSectionElement>) => (
	<thead
		className={cn(
			"bg-surface-subtle/50 [&_tr]:border-b [&_tr]:border-border",
			className,
		)}
		{...props}
	/>
);

const TableBody = ({
	className,
	...props
}: React.HTMLAttributes<HTMLTableSectionElement>) => (
	<tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />
);

const TableRow = ({
	className,
	...props
}: React.HTMLAttributes<HTMLTableRowElement>) => (
	<tr
		className={cn(
			"border-b border-border transition-colors hover:bg-accent/40 data-[state=selected]:bg-accent",
			className,
		)}
		{...props}
	/>
);

const TableHead = ({
	className,
	...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) => (
	<th
		className={cn(
			"h-9 px-3 text-left align-middle text-[11px] font-medium uppercase tracking-wider text-muted-foreground md:px-4 [&:has([role=checkbox])]:pr-0",
			className,
		)}
		{...props}
	/>
);

const TableCell = ({
	className,
	...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) => (
	<td
		className={cn(
			"px-3 py-3 align-middle text-sm text-foreground md:px-4 [&:has([role=checkbox])]:pr-0",
			className,
		)}
		{...props}
	/>
);

export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow };
