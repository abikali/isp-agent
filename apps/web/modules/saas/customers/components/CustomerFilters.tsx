"use client";

import { FilterBar } from "@shared/components/FilterBar";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
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

	const activeCount = [
		status !== "all" ? 1 : 0,
		planId !== "all" ? 1 : 0,
		stationId !== "all" ? 1 : 0,
		connectionType !== "all" ? 1 : 0,
	].reduce((a, b) => a + b, 0);

	function handleReset() {
		onStatusChange("all");
		onPlanIdChange("all");
		onStationIdChange("all");
		onConnectionTypeChange("all");
	}

	return (
		<FilterBar
			searchPlaceholder="Search customers..."
			searchValue={search}
			onSearchChange={onSearchChange}
			activeFilterCount={activeCount}
			onReset={handleReset}
		>
			<Select value={status} onValueChange={onStatusChange}>
				<SelectTrigger className="w-full sm:w-[140px]">
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
				<SelectTrigger className="w-full sm:w-[140px]">
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
				<SelectTrigger className="w-full sm:w-[140px]">
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
				<SelectTrigger className="w-full sm:w-[140px]">
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
		</FilterBar>
	);
}
