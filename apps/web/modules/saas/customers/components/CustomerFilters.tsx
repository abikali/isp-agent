"use client";

import { useCollectors, useCustomerGroups } from "@saas/billing/client";
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
	groupName: string;
	onGroupNameChange: (value: string) => void;
	collectorId: string;
	onCollectorIdChange: (value: string) => void;
	hasLocation: "all" | "yes" | "no";
	onHasLocationChange: (value: "all" | "yes" | "no") => void;
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
	groupName,
	onGroupNameChange,
	collectorId,
	onCollectorIdChange,
	hasLocation,
	onHasLocationChange,
}: CustomerFiltersProps) {
	const { plans } = usePlansQuery();
	const { stations } = useStationsQuery();
	const { groups } = useCustomerGroups();
	const { data: collectorsData } = useCollectors();
	const collectors = collectorsData?.collectors ?? [];

	const activeCount = [
		status !== "all" ? 1 : 0,
		planId !== "all" ? 1 : 0,
		stationId !== "all" ? 1 : 0,
		connectionType !== "all" ? 1 : 0,
		groupName !== "all" ? 1 : 0,
		collectorId !== "all" ? 1 : 0,
		hasLocation !== "all" ? 1 : 0,
	].reduce((a, b) => a + b, 0);

	function handleReset() {
		onStatusChange("all");
		onPlanIdChange("all");
		onStationIdChange("all");
		onConnectionTypeChange("all");
		onGroupNameChange("all");
		onCollectorIdChange("all");
		onHasLocationChange("all");
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

			<Select value={groupName} onValueChange={onGroupNameChange}>
				<SelectTrigger className="w-full sm:w-[140px]">
					<SelectValue placeholder="Group" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All Groups</SelectItem>
					{groups.map((g) => (
						<SelectItem key={g} value={g}>
							{g}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			<Select value={collectorId} onValueChange={onCollectorIdChange}>
				<SelectTrigger className="w-full sm:w-[140px]">
					<SelectValue placeholder="Collector" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All Collectors</SelectItem>
					{collectors.map((c) => (
						<SelectItem key={c.id} value={c.id}>
							{c.name}
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

			<Select
				value={hasLocation}
				onValueChange={(v) =>
					onHasLocationChange(v as "all" | "yes" | "no")
				}
			>
				<SelectTrigger className="w-full sm:w-[140px]">
					<SelectValue placeholder="Location" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">Any location</SelectItem>
					<SelectItem value="yes">Has location</SelectItem>
					<SelectItem value="no">Missing location</SelectItem>
				</SelectContent>
			</Select>
		</FilterBar>
	);
}
