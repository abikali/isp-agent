"use client";

import { Combobox } from "@ui/components/combobox";
import { useMemo } from "react";

interface CollectorSelectProps {
	value: string;
	onChange: (value: string) => void;
	collectors: Array<{ id: string; name: string }>;
	/**
	 * Offer an "Unassigned" option. Only for lists filtered by the customer's
	 * collector — a payment always has one, so the option would match nothing.
	 */
	includeUnassigned?: boolean;
	className?: string;
}

export function CollectorSelect({
	value,
	onChange,
	collectors,
	includeUnassigned,
	className = "w-full sm:w-[160px]",
}: CollectorSelectProps) {
	const options = useMemo(
		() => [
			{ value: "all", label: "All collectors" },
			...(includeUnassigned
				? [{ value: "none", label: "Unassigned" }]
				: []),
			...collectors.map((c) => ({ value: c.id, label: c.name })),
		],
		[collectors, includeUnassigned],
	);

	return (
		<Combobox
			options={options}
			value={value || "all"}
			onChange={(val) => onChange(val === "all" ? "" : val)}
			searchPlaceholder="Search collectors…"
			emptyText="No collectors found"
			className={className}
		/>
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
	const options = useMemo(
		() => [
			{ value: "all", label: "All areas" },
			{ value: "none", label: "No area" },
			...groups
				.filter((g) => !excludeFree || g.toLowerCase() !== "free")
				.map((g) => ({ value: g, label: g })),
		],
		[groups, excludeFree],
	);

	return (
		<Combobox
			options={options}
			value={value || "all"}
			onChange={(val) => onChange(val === "all" ? "" : val)}
			searchPlaceholder="Search areas…"
			emptyText="No areas found"
			className={className}
		/>
	);
}
