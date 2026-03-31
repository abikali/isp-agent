"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";

interface CollectorSelectProps {
	value: string;
	onChange: (value: string) => void;
	collectors: Array<{ id: string; name: string }>;
	className?: string;
}

export function CollectorSelect({
	value,
	onChange,
	collectors,
	className = "w-full sm:w-[160px]",
}: CollectorSelectProps) {
	return (
		<Select
			value={value || "all"}
			onValueChange={(val) => onChange(val === "all" ? "" : val)}
		>
			<SelectTrigger className={className}>
				<SelectValue placeholder="All collectors" />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="all">All collectors</SelectItem>
				{collectors.map((c) => (
					<SelectItem key={c.id} value={c.id}>
						{c.name}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

interface GroupSelectProps {
	value: string;
	onChange: (value: string) => void;
	groups: string[];
	/** Filter out the "free" group from the dropdown options */
	excludeFree?: boolean;
	className?: string;
}

export function GroupSelect({
	value,
	onChange,
	groups,
	excludeFree,
	className = "w-full sm:w-[160px]",
}: GroupSelectProps) {
	const filteredGroups = excludeFree
		? groups.filter((g) => g.toLowerCase() !== "free")
		: groups;

	return (
		<Select
			value={value || "all"}
			onValueChange={(val) => onChange(val === "all" ? "" : val)}
		>
			<SelectTrigger className={className}>
				<SelectValue placeholder="All areas" />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="all">All areas</SelectItem>
				{filteredGroups.map((g) => (
					<SelectItem key={g} value={g}>
						{g}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
