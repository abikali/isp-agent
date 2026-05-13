"use client";

import { cn } from "@ui/lib";
import type { LucideIcon } from "lucide-react";
import { InboxIcon } from "lucide-react";
import type { ReactNode } from "react";

export interface EmptyStateProps {
	icon?: LucideIcon;
	title: string;
	description?: string;
	/** Primary CTA — pass any ReactNode (typically a <Button>). */
	action?: ReactNode;
	/** Optional secondary CTA, rendered next to the primary action. */
	secondaryAction?: ReactNode;
	className?: string;
	children?: ReactNode;
}

/**
 * Shared empty state for list pages, charts, and any "no data yet" surface.
 *
 * Soft icon container + tight type stack + optional CTA row. The redesign
 * uses this everywhere — no more bespoke empty divs scattered through the
 * legacy codebase.
 */
export function EmptyState({
	icon: Icon = InboxIcon,
	title,
	description,
	action,
	secondaryAction,
	className,
	children,
}: EmptyStateProps) {
	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-6 py-12 text-center",
				className,
			)}
		>
			<div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
				<Icon className="size-5" />
			</div>
			<h3 className="text-base font-medium tracking-tight">{title}</h3>
			{description && (
				<p className="mt-1 max-w-md text-sm text-muted-foreground">
					{description}
				</p>
			)}
			{(action || secondaryAction) && (
				<div className="mt-5 flex flex-wrap items-center justify-center gap-2">
					{action}
					{secondaryAction}
				</div>
			)}
			{children}
		</div>
	);
}
