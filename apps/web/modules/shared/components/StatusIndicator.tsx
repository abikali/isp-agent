import { cn } from "@ui/lib";

type StatusType =
	| "online"
	| "offline"
	| "active"
	| "inactive"
	| "suspended"
	| "pending"
	| "expired";

interface StatusIndicatorProps {
	status: StatusType;
	label?: string;
	variant?: "dot" | "badge";
	size?: "sm" | "md";
}

const dotColorMap: Record<StatusType, string> = {
	online: "bg-green-500 shadow-status-online",
	offline: "bg-red-500 shadow-status-offline",
	active: "bg-green-500",
	inactive: "bg-zinc-400",
	suspended: "bg-amber-500",
	pending: "bg-blue-500",
	expired: "bg-red-400",
};

const badgeBgMap: Record<StatusType, string> = {
	online: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400",
	offline: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400",
	active: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400",
	inactive: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
	suspended:
		"bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
	pending: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
	expired: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400",
};

const defaultLabels: Record<StatusType, string> = {
	online: "Online",
	offline: "Offline",
	active: "Active",
	inactive: "Inactive",
	suspended: "Suspended",
	pending: "Pending",
	expired: "Expired",
};

export function StatusIndicator({
	status,
	label,
	variant = "dot",
	size = "md",
}: StatusIndicatorProps) {
	const displayLabel = label ?? defaultLabels[status];

	if (variant === "badge") {
		return (
			<span
				className={cn(
					"inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
					badgeBgMap[status],
				)}
			>
				<span
					className={cn(
						"rounded-full",
						size === "sm" ? "size-1.5" : "size-2",
						dotColorMap[status],
					)}
				/>
				{displayLabel}
			</span>
		);
	}

	return (
		<span className="inline-flex items-center gap-1.5">
			<span
				className={cn(
					"rounded-full",
					size === "sm" ? "size-1.5" : "size-2",
					dotColorMap[status],
				)}
			/>
			{displayLabel && (
				<span className={cn(size === "sm" ? "text-xs" : "text-sm")}>
					{displayLabel}
				</span>
			)}
		</span>
	);
}
