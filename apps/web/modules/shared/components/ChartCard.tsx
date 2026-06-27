"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@ui/components/card";
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
