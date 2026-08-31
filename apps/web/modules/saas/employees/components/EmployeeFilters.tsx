"use client";

import { useStationsQuery } from "@saas/customers/client";
import { FilterBar } from "@shared/components/FilterBar";
import { Combobox } from "@ui/components/combobox";
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
	bare?: boolean;
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
	bare,
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
			bare={bare}
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

			<Combobox
				options={[
					{ value: "all", label: "All Stations" },
					...stations.map((s) => ({ value: s.id, label: s.name })),
				]}
				value={stationId}
				onChange={onStationIdChange}
				searchPlaceholder="Search stations…"
				emptyText="No stations found"
				className="w-full sm:w-[140px]"
			/>
		</FilterBar>
	);
}
