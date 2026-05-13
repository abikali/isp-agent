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
	 * Set to `true` to make the page header sticky (rare — most pages keep it
	 * inline so it scrolls away with the content).
	 */
	sticky?: boolean;
	/**
	 * Set to `false` to remove the default horizontal padding on the content area
	 * (e.g. tables that should run edge to edge).
	 */
	contentPadding?: boolean;
	children: ReactNode;
}

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
	contentPadding = true,
	children,
}: PageShellProps) {
	const hasBreadcrumbs = breadcrumbs && breadcrumbs.length > 0;

	return (
		<>
			<header
				className={cn(
					"flex flex-col gap-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm sm:px-6 md:px-8",
					sticky && "sticky top-0 z-30",
				)}
			>
				{(hasBreadcrumbs || backTo) && (
					<div className="flex items-center gap-2">
						<SidebarTrigger className="-ml-1 md:hidden" />
						{backTo && (
							<Button
								asChild
								variant="ghost"
								size="sm"
								className="-ml-2"
							>
								<Link to={backTo} preload="intent">
									<ArrowLeftIcon className="size-4" />
									{backLabel ?? "Back"}
								</Link>
							</Button>
						)}
						{hasBreadcrumbs && (
							<Breadcrumb>
								<BreadcrumbList>
									{breadcrumbs.map((b, i) => {
										const isLast =
											i === breadcrumbs.length - 1;
										return (
											<BreadcrumbItem
												key={`${b.label}-${i}`}
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

				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
					<div className="flex min-w-0 items-center gap-2">
						{!hasBreadcrumbs && !backTo && (
							<SidebarTrigger className="-ml-1 md:hidden" />
						)}
						<div className="min-w-0 space-y-0.5">
							<div className="flex flex-wrap items-center gap-2">
								<h1 className="truncate text-xl font-medium tracking-tight sm:text-2xl">
									{title}
								</h1>
								{badges}
							</div>
							{subtitle && (
								<div className="text-sm text-muted-foreground">
									{subtitle}
								</div>
							)}
							{description && (
								<p className="text-sm text-muted-foreground">
									{description}
								</p>
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

			<div
				className={cn(
					"flex-1",
					contentPadding
						? "px-4 py-4 sm:px-6 sm:py-6 md:px-8"
						: undefined,
				)}
			>
				{children}
			</div>
		</>
	);
}
