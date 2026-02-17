"use client";

import { Input } from "@ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { SearchIcon } from "lucide-react";
import { usePlansQuery } from "../hooks/use-plans";
import { useStationsQuery } from "../hooks/use-stations";
import {
	CONNECTION_TYPE_OPTIONS,
	CUSTOMER_STATUS_OPTIONS,
} from "../lib/constants";

interface CustomerFiltersProps {
	search: string;
	onSearchChange: (value: string) => void;
	status: string;
	onStatusChange: (value: string) => void;
	planId: string;
	onPlanIdChange: (value: string) => void;
	stationId: string;
	onStationIdChange: (value: string) => void;
	connectionType: string;
	onConnectionTypeChange: (value: string) => void;
}

export function CustomerFilters({
	search,
	onSearchChange,
	status,
	onStatusChange,
	planId,
	onPlanIdChange,
	stationId,
	onStationIdChange,
	connectionType,
	onConnectionTypeChange,
}: CustomerFiltersProps) {
	const { plans } = usePlansQuery();
	const { stations } = useStationsQuery();

	return (
		<div className="flex flex-wrap items-center gap-3">
			<div className="relative min-w-[200px] flex-1 sm:max-w-xs">
				<SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					placeholder="Search customers..."
					value={search}
					onChange={(e) => onSearchChange(e.target.value)}
					className="pl-9"
				/>
			</div>

			<Select value={status} onValueChange={onStatusChange}>
				<SelectTrigger className="w-[140px]">
					<SelectValue placeholder="Status" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All Status</SelectItem>
					{CUSTOMER_STATUS_OPTIONS.map((opt) => (
						<SelectItem key={opt.value} value={opt.value}>
							{opt.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			<Select value={planId} onValueChange={onPlanIdChange}>
				<SelectTrigger className="w-[140px]">
					<SelectValue placeholder="Plan" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All Plans</SelectItem>
					{plans.map((p) => (
						<SelectItem key={p.id} value={p.id}>
							{p.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			<Select value={stationId} onValueChange={onStationIdChange}>
				<SelectTrigger className="w-[140px]">
					<SelectValue placeholder="Station" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All Stations</SelectItem>
					{stations.map((s) => (
						<SelectItem key={s.id} value={s.id}>
							{s.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			<Select
				value={connectionType}
				onValueChange={onConnectionTypeChange}
			>
				<SelectTrigger className="w-[140px]">
					<SelectValue placeholder="Connection" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All Types</SelectItem>
					{CONNECTION_TYPE_OPTIONS.map((opt) => (
						<SelectItem key={opt.value} value={opt.value}>
							{opt.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
