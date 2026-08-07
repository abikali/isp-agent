"use client";

import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@ui/components/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { cn } from "@ui/lib";
import { ListFilterIcon } from "lucide-react";
import { useState } from "react";

// react-doctor-disable-next-line react-doctor/only-export-components -- filter option constants co-located with the filter that renders them; imported by host pages, moving would churn imports for no gain
export const INSTALLATION_TYPE_OPTIONS = [
	{ value: "item", label: "Items" },
	{ value: "station", label: "Stations" },
	{ value: "base", label: "Bases" },
	{ value: "addon", label: "Add-ons" },
] as const;

// react-doctor-disable-next-line react-doctor/only-export-components -- filter option constants co-located with the filter that renders them; imported by host pages, moving would churn imports for no gain
export const INSTALLATION_STATUS_OPTIONS = [
	{ value: "PENDING", label: "Pending" },
	{ value: "APPROVED", label: "Approved" },
	{ value: "COMPLETED", label: "Completed" },
	{ value: "DENIED", label: "Denied" },
] as const;

export interface InstallationFiltersValue {
	type: string;
	employeeId: string;
	status: string;
	dateFrom: string;
	dateTo: string;
	priceMin: string;
	priceMax: string;
	qtyMin: string;
	qtyMax: string;
}

interface InstallationFiltersProps {
	value: InstallationFiltersValue;
	onChange: (next: Partial<InstallationFiltersValue>) => void;
	onReset: () => void;
	activeCount: number;
	employees: Array<{ id: string; name: string }>;
	/** Status filter only makes sense on the history tab (pending tab is fixed to PENDING). */
	showStatus: boolean;
}

export function InstallationFilters({
	value,
	onChange,
	onReset,
	activeCount,
	employees,
	showStatus,
}: InstallationFiltersProps) {
	const [open, setOpen] = useState(false);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					className={cn(
						"h-9",
						activeCount > 0 && "border-primary/40 text-foreground",
					)}
				>
					<ListFilterIcon className="mr-1.5 size-3.5" />
					Filters
					{activeCount > 0 && (
						<Badge
							variant="secondary"
							className="ml-1.5 h-5 min-w-5 justify-center px-1.5 tabular-nums"
						>
							{activeCount}
						</Badge>
					)}
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				className="w-[min(560px,calc(100vw-2rem))] p-0"
			>
				<div className="flex items-center justify-between border-b px-4 py-3">
					<p className="text-sm font-semibold">Filters</p>
					{activeCount > 0 && (
						<Button
							variant="ghost"
							size="sm"
							className="h-7 px-2 text-xs text-muted-foreground"
							onClick={onReset}
						>
							Reset all
						</Button>
					)}
				</div>

				<div className="grid gap-3 p-4 sm:grid-cols-2">
					<FilterField label="Type">
						<Select
							value={value.type}
							onValueChange={(v) => onChange({ type: v })}
						>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="Type" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All types</SelectItem>
								{INSTALLATION_TYPE_OPTIONS.map((opt) => (
									<SelectItem
										key={opt.value}
										value={opt.value}
									>
										{opt.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</FilterField>

					<FilterField label="Worker">
						<Select
							value={value.employeeId}
							onValueChange={(v) => onChange({ employeeId: v })}
						>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="Worker" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All workers</SelectItem>
								{employees.map((emp) => (
									<SelectItem key={emp.id} value={emp.id}>
										{emp.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</FilterField>

					{showStatus && (
						<FilterField label="Status">
							<Select
								value={value.status}
								onValueChange={(v) => onChange({ status: v })}
							>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Status" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">
										All statuses
									</SelectItem>
									{INSTALLATION_STATUS_OPTIONS.map((opt) => (
										<SelectItem
											key={opt.value}
											value={opt.value}
										>
											{opt.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</FilterField>
					)}

					<FilterField label="Installed between">
						<div className="flex items-center gap-2">
							<Input
								type="date"
								value={value.dateFrom}
								onChange={(e) =>
									onChange({ dateFrom: e.target.value })
								}
								aria-label="From date"
							/>
							<span className="text-xs text-muted-foreground">
								–
							</span>
							<Input
								type="date"
								value={value.dateTo}
								onChange={(e) =>
									onChange({ dateTo: e.target.value })
								}
								aria-label="To date"
							/>
						</div>
					</FilterField>

					<FilterField label="Price range ($)">
						<div className="flex items-center gap-2">
							<Input
								type="number"
								min={0}
								placeholder="Min"
								value={value.priceMin}
								onChange={(e) =>
									onChange({ priceMin: e.target.value })
								}
								aria-label="Minimum price"
							/>
							<span className="text-xs text-muted-foreground">
								–
							</span>
							<Input
								type="number"
								min={0}
								placeholder="Max"
								value={value.priceMax}
								onChange={(e) =>
									onChange({ priceMax: e.target.value })
								}
								aria-label="Maximum price"
							/>
						</div>
					</FilterField>

					<FilterField label="Quantity range">
						<div className="flex items-center gap-2">
							<Input
								type="number"
								min={1}
								placeholder="Min"
								value={value.qtyMin}
								onChange={(e) =>
									onChange({ qtyMin: e.target.value })
								}
								aria-label="Minimum quantity"
							/>
							<span className="text-xs text-muted-foreground">
								–
							</span>
							<Input
								type="number"
								min={1}
								placeholder="Max"
								value={value.qtyMax}
								onChange={(e) =>
									onChange({ qtyMax: e.target.value })
								}
								aria-label="Maximum quantity"
							/>
						</div>
					</FilterField>
				</div>

				<div className="flex justify-end border-t px-4 py-3">
					<Button size="sm" onClick={() => setOpen(false)}>
						Done
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}

function FilterField({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-1.5">
			<Label className="text-xs text-muted-foreground">{label}</Label>
			{children}
		</div>
	);
}
