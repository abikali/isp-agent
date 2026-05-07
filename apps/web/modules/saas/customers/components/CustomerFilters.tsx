"use client";

import { useCollectors, useCustomerGroups } from "@saas/billing/client";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
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
import { usePlansQuery } from "../hooks/use-plans";
import { useStationsQuery } from "../hooks/use-stations";
import {
	CONNECTION_TYPE_OPTIONS,
	CUSTOMER_STATUS_OPTIONS,
} from "../lib/constants";

export interface CustomerFiltersValue {
	status: string;
	planId: string;
	stationId: string;
	connectionType: string;
	groupName: string;
	collectorId: string;
	hasLocation: "all" | "yes" | "no";
}

interface CustomerFiltersProps {
	value: CustomerFiltersValue;
	onChange: (next: Partial<CustomerFiltersValue>) => void;
	onReset: () => void;
	activeCount: number;
}

export function CustomerFilters({
	value,
	onChange,
	onReset,
	activeCount,
}: CustomerFiltersProps) {
	const [open, setOpen] = useState(false);
	const { plans } = usePlansQuery();
	const { stations } = useStationsQuery();
	const { groups } = useCustomerGroups();
	const { data: collectorsData } = useCollectors();
	const collectors = collectorsData?.collectors ?? [];

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
								{CUSTOMER_STATUS_OPTIONS.map((opt) => (
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

					<FilterField label="Plan">
						<Select
							value={value.planId}
							onValueChange={(v) => onChange({ planId: v })}
						>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="Plan" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All plans</SelectItem>
								{plans.map((p) => (
									<SelectItem key={p.id} value={p.id}>
										{p.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</FilterField>

					<FilterField label="Station">
						<Select
							value={value.stationId}
							onValueChange={(v) => onChange({ stationId: v })}
						>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="Station" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">
									All stations
								</SelectItem>
								{stations.map((s) => (
									<SelectItem key={s.id} value={s.id}>
										{s.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</FilterField>

					<FilterField label="Group">
						<Select
							value={value.groupName}
							onValueChange={(v) => onChange({ groupName: v })}
						>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="Group" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All groups</SelectItem>
								{groups.map((g) => (
									<SelectItem key={g} value={g}>
										{g}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</FilterField>

					<FilterField label="Collector">
						<Select
							value={value.collectorId}
							onValueChange={(v) => onChange({ collectorId: v })}
						>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="Collector" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">
									All collectors
								</SelectItem>
								<SelectItem value="none">Unassigned</SelectItem>
								{collectors.map((c) => (
									<SelectItem key={c.id} value={c.id}>
										{c.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</FilterField>

					<FilterField label="Connection">
						<Select
							value={value.connectionType}
							onValueChange={(v) =>
								onChange({ connectionType: v })
							}
						>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="Connection" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">
									All connections
								</SelectItem>
								{CONNECTION_TYPE_OPTIONS.map((opt) => (
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

					<FilterField label="Location">
						<Select
							value={value.hasLocation}
							onValueChange={(v) =>
								onChange({
									hasLocation: v as "all" | "yes" | "no",
								})
							}
						>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="Location" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">
									Any location
								</SelectItem>
								<SelectItem value="yes">
									Has location
								</SelectItem>
								<SelectItem value="no">
									Missing location
								</SelectItem>
							</SelectContent>
						</Select>
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
