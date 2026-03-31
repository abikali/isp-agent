"use client";

import { useStationsQuery } from "@saas/customers/client";
import { FilterBar } from "@shared/components/FilterBar";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import {
	EMPLOYEE_DEPARTMENT_OPTIONS,
	EMPLOYEE_STATUS_OPTIONS,
} from "../lib/constants";

interface EmployeeFiltersProps {
	search: string;
	onSearchChange: (value: string) => void;
	status: string;
	onStatusChange: (value: string) => void;
	department: string;
	onDepartmentChange: (value: string) => void;
	stationId: string;
	onStationIdChange: (value: string) => void;
}

export function EmployeeFilters({
	search,
	onSearchChange,
	status,
	onStatusChange,
	department,
	onDepartmentChange,
	stationId,
	onStationIdChange,
}: EmployeeFiltersProps) {
	const { stations } = useStationsQuery();

	const activeCount = [
		status !== "all" ? 1 : 0,
		department !== "all" ? 1 : 0,
		stationId !== "all" ? 1 : 0,
	].reduce((a, b) => a + b, 0);

	function handleReset() {
		onStatusChange("all");
		onDepartmentChange("all");
		onStationIdChange("all");
	}

	return (
		<FilterBar
			searchPlaceholder="Search employees..."
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
					{EMPLOYEE_STATUS_OPTIONS.map((opt) => (
						<SelectItem key={opt.value} value={opt.value}>
							{opt.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			<Select value={department} onValueChange={onDepartmentChange}>
				<SelectTrigger className="w-full sm:w-[160px]">
					<SelectValue placeholder="Department" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All Departments</SelectItem>
					{EMPLOYEE_DEPARTMENT_OPTIONS.map((opt) => (
						<SelectItem key={opt.value} value={opt.value}>
							{opt.label}
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
		</FilterBar>
	);
}
