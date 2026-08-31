"use client";

import { useEmployeesQuery } from "@saas/employees/client";
import { Combobox } from "@ui/components/combobox";
import { Input } from "@ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { SearchIcon } from "lucide-react";
import { useMemo } from "react";
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
	const { employees } = useEmployeesQuery({ role: "worker" });
	const employeeOptions = useMemo(
		() => [
			{ value: "all", label: "All Assignees" },
			...employees.map((emp) => ({ value: emp.id, label: emp.name })),
		],
		[employees],
	);

	return (
		<div className="flex flex-wrap items-center gap-3">
			<div className="relative w-full sm:min-w-[200px] sm:max-w-xs sm:flex-1">
				<SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					placeholder="Search tasks..."
					value={search}
					onChange={(e) => onSearchChange(e.target.value)}
					className="pl-9"
				/>
			</div>

			<Select value={status} onValueChange={onStatusChange}>
				<SelectTrigger className="w-full sm:w-[140px]">
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
				<SelectTrigger className="w-full sm:w-[130px]">
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
				<SelectTrigger className="w-full sm:w-[140px]">
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

			<Combobox
				options={employeeOptions}
				value={employeeId}
				onChange={onEmployeeIdChange}
				searchPlaceholder="Search assignees…"
				emptyText="No assignees found"
				className="w-full sm:w-[150px]"
			/>
		</div>
	);
}
