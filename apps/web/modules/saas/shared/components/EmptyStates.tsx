"use client";

import { Button } from "@ui/components/button";
import { Inbox, type LucideIcon } from "lucide-react";
import { StateCard, type StateCardProps } from "./DataState";

/**
 * Pre-built empty state configurations for common use cases
 */
// react-doctor-disable-next-line deslop/unused-export -- public module API surface re-exported via the @saas/shared/client barrel; intended reusable empty-state presets
export const EmptyStates = {
	/**
	 * Empty state for list views with an add action
	 */
	WithAction: ({
		icon,
		title,
		description,
		actionLabel,
		onAction,
		className,
	}: {
		icon: LucideIcon;
		title: string;
		description: string;
		actionLabel: string;
		onAction: () => void;
		className?: string;
	}) => {
		const props: StateCardProps = {
			icon,
			title,
			description,
			action: <Button onClick={onAction}>{actionLabel}</Button>,
		};
		if (className) {
			props.className = className;
		}
		return <StateCard {...props} />;
	},

	/**
	 * Empty state for filtered results
	 */
	// react-doctor-disable-next-line react-doctor/no-multi-comp -- co-located empty-state variants barrel; small render helpers grouped under one exported object
	NoResults: ({ className }: { className?: string }) => {
		const props: StateCardProps = {
			icon: Inbox,
			title: "No results found",
			description: "Try adjusting your filters or search terms.",
		};
		if (className) {
			props.className = className;
		}
		return <StateCard {...props} />;
	},

	/**
	 * Empty state for search
	 */
	// react-doctor-disable-next-line react-doctor/no-multi-comp -- co-located empty-state variants barrel; small render helpers grouped under one exported object
	NoSearchResults: ({
		query,
		className,
	}: {
		query?: string;
		className?: string;
	}) => {
		const props: StateCardProps = {
			icon: Inbox,
			title: "No results found",
			description: query
				? `No results found for "${query}". Try a different search term.`
				: "Try a different search term.",
		};
		if (className) {
			props.className = className;
		}
		return <StateCard {...props} />;
	},
};
