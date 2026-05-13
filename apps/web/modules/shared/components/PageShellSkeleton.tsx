"use client";

import { Skeleton } from "@ui/components/skeleton";
import { cn } from "@ui/lib";
import type { PropsWithChildren } from "react";

export interface PageShellSkeletonProps {
	showDescription?: boolean;
	showActions?: boolean;
	bleed?: boolean;
}

export function PageShellSkeleton({
	showDescription = true,
	showActions = true,
	bleed = false,
	children,
}: PropsWithChildren<PageShellSkeletonProps>) {
	const pageGutter = bleed ? "" : "px-6 md:px-8";

	return (
		<>
			<header
				className={cn(
					"flex flex-col gap-3 border-b border-border bg-background pt-5 pb-5 md:pt-6 md:pb-6",
					pageGutter,
				)}
			>
				<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
					<div className="min-w-0 flex-1 space-y-2">
						<Skeleton className="h-7 w-48 max-w-full" />
						{showDescription && (
							<Skeleton className="h-4 w-72 max-w-full" />
						)}
					</div>
					{showActions && (
						<div className="flex shrink-0 items-center gap-2">
							<Skeleton className="h-9 w-28" />
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
