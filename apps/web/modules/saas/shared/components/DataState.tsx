"use client";

import { Button } from "@ui/components/button";
import { cn } from "@ui/lib";
import {
	AlertCircle,
	Inbox,
	Loader2,
	type LucideIcon,
	RefreshCw,
} from "lucide-react";
import type { ReactNode } from "react";

interface DataStateProps {
	/** Whether data is currently loading */
	isLoading?: boolean;
	/** Error object or message if data fetch failed */
	error?: Error | string | null;
	/** The actual data - used to determine empty state */
	data?: unknown[] | null;
	/** Whether to show empty state when data is empty */
	showEmpty?: boolean;
	/** Children to render when data is available */
	children?: ReactNode;
	/** Custom loading component */
	loadingComponent?: ReactNode;
	/** Custom error component */
	errorComponent?: ReactNode;
	/** Custom empty component */
	emptyComponent?: ReactNode;
	/** Retry callback for error state */
	onRetry?: () => void;
	/** Custom class name for container */
	className?: string;
}

interface StateCardProps {
	icon: LucideIcon;
	title: string;
	description?: string;
	action?: ReactNode;
	variant?: "default" | "error";
	className?: string;
}

/**
 * Reusable card for different states (loading, empty, error)
 */
function StateCard({
	icon: Icon,
	title,
	description,
	action,
	variant = "default",
	className,
}: StateCardProps) {
	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center py-12 text-center",
				className,
			)}
		>
			<div
				className={cn(
					"mb-4 rounded-full p-4",
					variant === "error" ? "bg-destructive/10" : "bg-muted",
				)}
			>
				<Icon
					className={cn(
						"size-8",
						variant === "error"
							? "text-destructive"
							: "text-muted-foreground",
					)}
				/>
			</div>
			<h3 className="mb-1 font-semibold text-lg">{title}</h3>
			{description && (
				<p className="mb-4 max-w-md text-muted-foreground text-sm">
					{description}
				</p>
			)}
			{action}
		</div>
	);
}

/**
 * Loading state with spinner
 */
function LoadingState({ className }: { className?: string | undefined }) {
	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center py-12",
				className,
			)}
		>
			<Loader2 className="size-8 animate-spin text-muted-foreground" />
			<p className="mt-2 text-muted-foreground text-sm">Loading...</p>
		</div>
	);
}

/**
 * Error state with retry option
 */
function ErrorState({
	error,
	onRetry,
	className,
}: {
	error: Error | string | null;
	onRetry?: (() => void) | undefined;
	className?: string | undefined;
}) {
	const message =
		error instanceof Error
			? error.message
			: error || "Something went wrong";

	const props: StateCardProps = {
		icon: AlertCircle,
		title: "Failed to load",
		description: message,
		variant: "error",
	};
	if (className) {
		props.className = className;
	}
	if (onRetry) {
		props.action = (
			<Button variant="outline" size="sm" onClick={onRetry}>
				<RefreshCw className="mr-2 size-4" />
				Try again
			</Button>
		);
	}

	return <StateCard {...props} />;
}

/**
 * Default empty state
 */
function DefaultEmptyState({ className }: { className?: string | undefined }) {
	const props: StateCardProps = {
		icon: Inbox,
		title: "No data",
		description: "There's nothing to show here yet.",
	};
	if (className) {
		props.className = className;
	}
	return <StateCard {...props} />;
}

/**
 * Unified component for handling loading, error, and empty states.
 * Reduces boilerplate for data fetching UI patterns.
 *
 * @example
 * ```tsx
 * <DataState
 *   isLoading={isLoading}
 *   error={error}
 *   data={profiles}
 *   onRetry={refetch}
 * >
 *   {profiles?.map(profile => <ProfileCard key={profile.id} {...profile} />)}
 * </DataState>
 * ```
 *
 * @example With custom empty state
 * ```tsx
 * <DataState
 *   isLoading={isLoading}
 *   error={error}
 *   data={contacts}
 *   emptyComponent={<CustomEmptyState onAdd={handleAdd} />}
 * >
 *   <ContactList contacts={contacts} />
 * </DataState>
 * ```
 */
export function DataState({
	isLoading,
	error,
	data,
	showEmpty = true,
	children,
	loadingComponent,
	errorComponent,
	emptyComponent,
	onRetry,
	className,
}: DataStateProps) {
	// Loading state
	if (isLoading) {
		return loadingComponent ?? <LoadingState className={className} />;
	}

	// Error state
	if (error) {
		return (
			errorComponent ?? (
				<ErrorState
					error={error}
					onRetry={onRetry}
					className={className}
				/>
			)
		);
	}

	// Empty state
	if (
		showEmpty &&
		data !== undefined &&
		Array.isArray(data) &&
		data.length === 0
	) {
		return emptyComponent ?? <DefaultEmptyState className={className} />;
	}

	// Data available - render children
	return <>{children}</>;
}

/**
 * Pre-built empty state configurations for common use cases
 */
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

// Export StateCard for custom states
export { StateCard, LoadingState, ErrorState, DefaultEmptyState };
