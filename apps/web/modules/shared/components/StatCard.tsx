import { cn } from "@ui/lib";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type StatColor =
	| "blue"
	| "green"
	| "emerald"
	| "amber"
	| "red"
	| "orange"
	| "purple"
	| "default";

const valueColorStyles: Record<StatColor, string> = {
	default: "",
	blue: "text-blue-600 dark:text-blue-400",
	green: "text-green-600 dark:text-green-400",
	emerald: "text-emerald-600 dark:text-emerald-400",
	amber: "text-amber-600 dark:text-amber-400",
	red: "text-red-600 dark:text-red-400",
	orange: "text-orange-600 dark:text-orange-400",
	purple: "text-purple-600 dark:text-purple-400",
};

interface StatCardProps {
	title: string;
	value: string | number;
	icon?: LucideIcon;
	color?: StatColor;
	description?: string;
	href?: string;
	onClick?: () => void;
	active?: boolean;
}

export function StatCard({
	title,
	value,
	icon: Icon,
	color = "default",
	description,
	href,
	onClick,
	active,
}: StatCardProps) {
	const interactive = !!href || !!onClick;
	const card = (
		<div
			className={cn(
				"rounded-lg border bg-card px-3 py-2.5 sm:px-4 sm:py-3 min-w-0",
				interactive &&
					"hover:shadow-card-hover cursor-pointer transition-shadow",
				active && "ring-2 ring-primary border-primary",
			)}
		>
			<p className="text-[11px] sm:text-xs font-medium text-muted-foreground flex items-center gap-1.5 min-w-0">
				{Icon && <Icon className="size-3.5 shrink-0" />}
				<span className="truncate">{title}</span>
			</p>
			<p
				className={cn(
					"text-base sm:text-lg font-bold tabular-nums mt-0.5 truncate",
					valueColorStyles[color],
				)}
			>
				{typeof value === "number" ? value.toLocaleString() : value}
			</p>
			{description && (
				<p className="text-xs text-muted-foreground">{description}</p>
			)}
		</div>
	);

	if (href) {
		return <a href={href}>{card}</a>;
	}
	if (onClick) {
		return (
			<button
				type="button"
				onClick={onClick}
				className="text-left w-full"
				aria-pressed={active}
			>
				{card}
			</button>
		);
	}
	return card;
}

interface StatCardGroupProps {
	children: ReactNode;
	columns?: 2 | 3 | 4 | 5 | 6;
}

const columnClass: Record<number, string> = {
	2: "grid-cols-2",
	3: "grid-cols-2 sm:grid-cols-3",
	4: "grid-cols-2 sm:grid-cols-4",
	5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
	6: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6",
};

// react-doctor-disable-next-line react-doctor/no-multi-comp -- cohesive StatCard primitive barrel (card, group, skeleton)
export function StatCardGroup({ children, columns = 4 }: StatCardGroupProps) {
	return (
		<div className={cn("grid gap-3", columnClass[columns])}>{children}</div>
	);
}

// react-doctor-disable-next-line react-doctor/no-multi-comp -- cohesive StatCard primitive barrel (card, group, skeleton)
export function StatCardSkeleton() {
	return (
		<div className="rounded-lg border bg-card px-4 py-3">
			<div className="h-3.5 w-20 rounded bg-muted animate-pulse mb-2" />
			<div className="h-5 w-24 rounded bg-muted animate-pulse" />
		</div>
	);
}
