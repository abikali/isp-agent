"use client";

import { useEmployeesQuery } from "@saas/employees/client";
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
	TASK_CATEGORY_OPTIONS,
	TASK_PRIORITY_OPTIONS,
	TASK_STATUS_OPTIONS,
} from "../lib/constants";

interface TaskFiltersProps {
	search: string;
	onSearchChange: (value: string) => void;
	status: string;
	onStatusChange: (value: string) => void;
	priority: string;
	onPriorityChange: (value: string) => void;
	category: string;
	onCategoryChange: (value: string) => void;
	employeeId: string;
	onEmployeeIdChange: (value: string) => void;
}

export function TaskFilters({
	search,
	onSearchChange,
	status,
	onStatusChange,
	priority,
	onPriorityChange,
	category,
	onCategoryChange,
	employeeId,
	onEmployeeIdChange,
}: TaskFiltersProps) {
	const { employees } = useEmployeesQuery();

	return (
		<div className="flex flex-wrap items-center gap-3">
			<div className="relative min-w-[200px] flex-1 sm:max-w-xs">
				<SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					placeholder="Search tasks..."
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
					{TASK_STATUS_OPTIONS.map((opt) => (
						<SelectItem key={opt.value} value={opt.value}>
							{opt.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			<Select value={priority} onValueChange={onPriorityChange}>
				<SelectTrigger className="w-[130px]">
					<SelectValue placeholder="Priority" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All Priority</SelectItem>
					{TASK_PRIORITY_OPTIONS.map((opt) => (
						<SelectItem key={opt.value} value={opt.value}>
							{opt.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			<Select value={category} onValueChange={onCategoryChange}>
				<SelectTrigger className="w-[140px]">
					<SelectValue placeholder="Category" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All Categories</SelectItem>
					{TASK_CATEGORY_OPTIONS.map((opt) => (
						<SelectItem key={opt.value} value={opt.value}>
							{opt.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			<Select value={employeeId} onValueChange={onEmployeeIdChange}>
				<SelectTrigger className="w-[150px]">
					<SelectValue placeholder="Assignee" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All Assignees</SelectItem>
					{employees.map((emp) => (
						<SelectItem key={emp.id} value={emp.id}>
							{emp.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
