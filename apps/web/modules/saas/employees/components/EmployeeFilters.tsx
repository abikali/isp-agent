"use client";

import { useStationsQuery } from "@saas/customers/client";
import { Input } from "@ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { SearchIcon } from "lucide-react";
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

	return (
		<div className="flex flex-wrap items-center gap-3">
			<div className="relative min-w-[200px] flex-1 sm:max-w-xs">
				<SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					placeholder="Search employees..."
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
					{EMPLOYEE_STATUS_OPTIONS.map((opt) => (
						<SelectItem key={opt.value} value={opt.value}>
							{opt.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			<Select value={department} onValueChange={onDepartmentChange}>
				<SelectTrigger className="w-[160px]">
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
		</div>
	);
}
