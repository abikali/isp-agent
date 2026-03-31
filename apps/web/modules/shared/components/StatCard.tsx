import { Link } from "@tanstack/react-router";
import { Skeleton } from "@ui/components/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@ui/components/tooltip";
import { cn } from "@ui/lib";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface StatCardProps {
	title: string;
	value: string | number;
	icon: LucideIcon;
	trend?: { value: string; direction: "up" | "down" | "neutral" };
	variant?: "default" | "success" | "warning" | "destructive";
	description?: string;
	href?: string;
}

const variantColor: Record<string, string> = {
	default: "text-foreground",
	success: "text-green-600 dark:text-green-400",
	warning: "text-amber-600 dark:text-amber-400",
	destructive: "text-red-600 dark:text-red-400",
};

const trendColor: Record<string, string> = {
	up: "text-green-600 dark:text-green-400",
	down: "text-red-600 dark:text-red-400",
	neutral: "text-muted-foreground",
};

export function StatCard({
	title,
	value,
	icon: Icon,
	trend,
	variant = "default",
	description,
	href,
}: StatCardProps) {
	const content = (
		<div
			className={cn(
				"rounded-xl bg-card p-3 sm:p-5 shadow-card transition-shadow",
				href && "hover:shadow-card-hover cursor-pointer",
			)}
		>
			<div className="flex items-center justify-between">
				<p className="text-sm font-medium text-muted-foreground">
					{title}
				</p>
				{description ? (
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<div className="rounded-lg bg-muted/50 p-2">
									<Icon className="size-4 text-muted-foreground" />
								</div>
							</TooltipTrigger>
							<TooltipContent>{description}</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				) : (
					<div className="rounded-lg bg-muted/50 p-2">
						<Icon className="size-4 text-muted-foreground" />
					</div>
				)}
			</div>
			<div className="mt-3 flex items-baseline gap-2">
				<span
					className={cn(
						"text-xl sm:text-2xl font-bold tabular-nums",
						variantColor[variant],
					)}
				>
					{typeof value === "number" ? value.toLocaleString() : value}
				</span>
				{trend && (
					<span
						className={cn(
							"text-xs font-medium",
							trendColor[trend.direction],
						)}
					>
						{trend.direction === "up" ? "+" : ""}
						{trend.value}
					</span>
				)}
			</div>
		</div>
	);

	if (href) {
		return (
			<Link to={href} preload="intent">
				{content}
			</Link>
		);
	}
	return content;
}

interface StatCardGroupProps {
	children: ReactNode;
	columns?: 2 | 3 | 4 | 5;
}

const columnClass: Record<number, string> = {
	2: "grid-cols-1 sm:grid-cols-2",
	3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
	4: "grid-cols-2 lg:grid-cols-4",
	5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
};

export function StatCardGroup({ children, columns = 4 }: StatCardGroupProps) {
	return (
		<div className={cn("grid gap-4", columnClass[columns])}>{children}</div>
	);
}

export function StatCardSkeleton() {
	return (
		<div className="rounded-xl bg-card p-3 sm:p-5 shadow-card">
			<div className="flex items-center justify-between">
				<Skeleton className="h-4 w-20" />
				<Skeleton className="size-8 rounded-lg" />
			</div>
			<Skeleton className="mt-3 h-7 w-16" />
		</div>
	);
}
