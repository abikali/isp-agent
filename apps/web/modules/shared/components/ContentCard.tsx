"use client";

import { cn } from "@ui/lib";
import type { HTMLAttributes, ReactNode } from "react";

/**
 * Contained list/detail surface — the visual container that holds toolbars,
 * tables, charts, and other primary content blocks.
 *
 * Pattern matches Vercel: 1px alpha border, 8px radius, subtle box-shadow,
 * `bg-card` so the surface sits a step above the page background. Children
 * compose as <ContentCardToolbar /> + raw body content; the body has no inner
 * padding so tables/lists run edge-to-edge inside the card.
 *
 * @example
 * <ContentCard>
 *   <ContentCardToolbar>
 *     <SearchInput />
 *     <Filters />
 *     <ContentCardActions>
 *       <Button>Add</Button>
 *     </ContentCardActions>
 *   </ContentCardToolbar>
 *   <DataTable ... />
 * </ContentCard>
 */
export function ContentCard({
	className,
	children,
	...props
}: HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn(
				"overflow-hidden rounded-lg border border-border bg-card shadow-xs",
				className,
			)}
			{...props}
		>
			{children}
		</div>
	);
}

export interface ContentCardSectionProps
	extends HTMLAttributes<HTMLDivElement> {
	/** Pads the content inside the section. Default true (padded body); pass false to bleed (tables/charts). */
	padded?: boolean;
}

/**
 * A bordered section inside a ContentCard. Useful when stacking multiple
 * blocks inside one card (e.g. summary stats on top, table below).
 */
export function ContentCardSection({
	className,
	padded = true,
	children,
	...props
}: ContentCardSectionProps) {
	return (
		<div
			className={cn(
				"border-b border-border last:border-b-0",
				padded && "p-4 md:p-5",
				className,
			)}
			{...props}
		>
			{children}
		</div>
	);
}

export interface ContentCardToolbarProps
	extends HTMLAttributes<HTMLDivElement> {
	/** Slot rendered on the right side, separated from the rest by `ml-auto`. */
	actions?: ReactNode;
}

/**
 * Toolbar row inside a ContentCard — search, filters, and trailing actions.
 *
 * Surface: `bg-surface-subtle` so it reads as the card's header strip without
 * a hard divider. Internal flex with gap-2; pass `actions` for right-side
 * grouped controls.
 */
export function ContentCardToolbar({
	className,
	children,
	actions,
	...props
}: ContentCardToolbarProps) {
	return (
		<div
			className={cn(
				"flex flex-wrap items-center gap-2 border-b border-border bg-surface-subtle/40 px-3 py-2.5 md:px-4",
				className,
			)}
			{...props}
		>
			<div className="flex flex-1 flex-wrap items-center gap-2">
				{children}
			</div>
			{actions && (
				<div className="flex shrink-0 flex-wrap items-center gap-2">
					{actions}
				</div>
			)}
		</div>
	);
}

/**
 * Footer row inside a ContentCard — pagination, total counts, etc.
 */
export function ContentCardFooter({
	className,
	children,
	...props
}: HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn(
				"flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface-subtle/40 px-3 py-2.5 text-sm text-muted-foreground md:px-4",
				className,
			)}
			{...props}
		>
			{children}
		</div>
	);
}
