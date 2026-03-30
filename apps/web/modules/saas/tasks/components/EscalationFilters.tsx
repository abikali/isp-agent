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
import {
	FOLLOW_UP_STATUS_LABELS,
	TASK_PRIORITY_OPTIONS,
	TASK_STATUS_OPTIONS,
} from "../lib/constants";

interface EscalationFiltersProps {
	search: string;
	onSearchChange: (value: string) => void;
	status: string;
	onStatusChange: (value: string) => void;
	priority: string;
	onPriorityChange: (value: string) => void;
	followUp: string;
	onFollowUpChange: (value: string) => void;
}

export function EscalationFilters({
	search,
	onSearchChange,
	status,
	onStatusChange,
	priority,
	onPriorityChange,
	followUp,
	onFollowUpChange,
}: EscalationFiltersProps) {
	return (
		<div className="flex flex-wrap items-center gap-3">
			<div className="relative min-w-[200px] flex-1 sm:max-w-xs">
				<SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					placeholder="Search escalations..."
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

			<Select value={followUp} onValueChange={onFollowUpChange}>
				<SelectTrigger className="w-[150px]">
					<SelectValue placeholder="Follow-up" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All Follow-ups</SelectItem>
					{Object.entries(FOLLOW_UP_STATUS_LABELS).map(
						([value, label]) => (
							<SelectItem key={value} value={value}>
								{label}
							</SelectItem>
						),
					)}
				</SelectContent>
			</Select>
		</div>
	);
}
