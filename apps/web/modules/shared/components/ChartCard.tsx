"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@ui/components/card";
import { Skeleton } from "@ui/components/skeleton";
import { cn } from "@ui/lib";
import type { ReactNode } from "react";

interface ChartCardProps {
	title: string;
	description?: string;
	children: ReactNode;
	className?: string;
	actions?: ReactNode;
}

export function ChartCard({
	title,
	description,
	children,
	className,
	actions,
}: ChartCardProps) {
	return (
		<Card className={cn("shadow-card", className)}>
			<CardHeader className="pb-2">
				<div className="flex items-center justify-between">
					<div>
						<CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
							{title}
						</CardTitle>
						{description && (
							<CardDescription className="mt-1">
								{description}
							</CardDescription>
						)}
					</div>
					{actions}
				</div>
			</CardHeader>
			<CardContent>{children}</CardContent>
		</Card>
	);
}

export function ChartCardSkeleton({ className }: { className?: string }) {
	return (
		<Card className={cn("shadow-card", className)}>
			<CardHeader className="pb-2">
				<Skeleton className="h-4 w-32" />
			</CardHeader>
			<CardContent>
				<Skeleton className="h-48 w-full" />
			</CardContent>
		</Card>
	);
}
