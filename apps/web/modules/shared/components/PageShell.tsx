"use client";

import { Link } from "@tanstack/react-router";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@ui/components/breadcrumb";
import { Button } from "@ui/components/button";
import { SidebarTrigger } from "@ui/components/sidebar";
import { cn } from "@ui/lib";
import { ArrowLeftIcon } from "lucide-react";
import type { ReactNode } from "react";

export interface BreadcrumbDescriptor {
	label: string;
	to?: string;
}

export interface PageShellProps {
	title: string;
	description?: string;
	backTo?: string;
	backLabel?: string;
	actions?: ReactNode;
	badges?: ReactNode;
	subtitle?: ReactNode;
	breadcrumbs?: BreadcrumbDescriptor[];
	/**
	 * Render the page header as a sticky top bar (rare). Most pages let it
	 * scroll with the content so tooltips and dropdowns aren't covered.
	 */
	sticky?: boolean;
	/**
	 * Drop the outer page gutters so children can run edge-to-edge
	 * (full-bleed conversation thread, embedded canvases, etc).
	 */
	bleed?: boolean;
	children: ReactNode;
}

/**
 * Standard page shell — Vercel-grade title section + page gutters.
 *
 * Layout:
 *   • Optional breadcrumb / back row at the top (small, muted).
 *   • Title row: large title with optional badges, description below, actions
 *     pushed to the right on desktop.
 *   • Content area with consistent gutters (24px mobile / 32px desktop) and
 *     vertical rhythm (24px between sections).
 *
 * Pages that want their list/table in a contained surface should wrap their
 * content in <ContentCard> (see ./ContentCard.tsx).
 */
export function PageShell({
	title,
	description,
	backTo,
	backLabel,
	actions,
	badges,
	subtitle,
	breadcrumbs,
	sticky = false,
	bleed = false,
	children,
}: PageShellProps) {
	const hasBreadcrumbs = breadcrumbs && breadcrumbs.length > 0;
	const hasNavRow = hasBreadcrumbs || !!backTo;

	const pageGutter = bleed ? "" : "px-6 md:px-8";

	return (
		<>
			<header
				className={cn(
					"flex flex-col gap-3 border-b border-border bg-background pt-5 pb-5 md:pt-6 md:pb-6",
					pageGutter,
					sticky &&
						"sticky top-0 z-30 bg-background/90 backdrop-blur",
				)}
			>
				{hasNavRow && (
					<div className="flex min-h-7 items-center gap-2 text-sm text-muted-foreground">
						<SidebarTrigger className="-ml-1 md:hidden" />
						{backTo && (
							<Button
								asChild
								variant="ghost"
								size="sm"
								className="-ml-2 h-7 px-2"
							>
								<Link to={backTo} preload="intent">
									<ArrowLeftIcon className="size-3.5" />
									{backLabel ?? "Back"}
								</Link>
							</Button>
						)}
						{hasBreadcrumbs && (
							<Breadcrumb>
								<BreadcrumbList className="gap-1.5 text-xs sm:gap-2">
									{breadcrumbs.map((b, i) => {
										const isLast =
											i === breadcrumbs.length - 1;
										return (
											<BreadcrumbItem
												key={`${b.label}-${b.to ?? ""}`}
											>
												{isLast || !b.to ? (
													<BreadcrumbPage>
														{b.label}
													</BreadcrumbPage>
												) : (
													<>
														<BreadcrumbLink asChild>
															<Link
																to={b.to}
																preload="intent"
															>
																{b.label}
															</Link>
														</BreadcrumbLink>
														<BreadcrumbSeparator />
													</>
												)}
											</BreadcrumbItem>
										);
									})}
								</BreadcrumbList>
							</Breadcrumb>
						)}
					</div>
				)}

				<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
					<div className="flex min-w-0 items-start gap-3">
						{!hasNavRow && (
							<SidebarTrigger className="mt-1 -ml-1 md:hidden" />
						)}
						<div className="min-w-0 space-y-1.5">
							<div className="flex flex-wrap items-center gap-2.5">
								<h1 className="font-sans truncate text-[1.625rem] font-medium leading-[1.15] tracking-[-0.025em] text-foreground">
									{title}
								</h1>
								{badges}
							</div>
							{description && (
								<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
									{description}
								</p>
							)}
							{subtitle && (
								<div className="text-sm text-muted-foreground">
									{subtitle}
								</div>
							)}
						</div>
					</div>
					{actions && (
						<div className="flex shrink-0 flex-wrap items-center gap-2">
							{actions}
						</div>
					)}
				</div>
			</header>

			<div className={cn("flex-1 space-y-6 py-6 md:py-8", pageGutter)}>
				{children}
			</div>
		</>
	);
}
