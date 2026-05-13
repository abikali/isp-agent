import { cn } from "@ui/lib";

interface CountBadgeProps {
	count: number;
	size?: "sm" | "md";
	className?: string;
}

/**
 * Solid-red notification count pill used wherever something needs the user's
 * attention (unreviewed payments, sidebar nav badges, tab counts).
 *
 * Returns null when count <= 0 so callers don't need to guard.
 * Caps at "99+" so two/three-digit counts don't blow out the layout.
 */
export function CountBadge({ count, size = "md", className }: CountBadgeProps) {
	if (count <= 0) {
		return null;
	}
	const display = count > 99 ? "99+" : String(count);
	return (
		<span
			className={cn(
				"inline-flex items-center justify-center rounded-full bg-destructive font-semibold leading-none tabular-nums text-destructive-foreground shadow-sm ring-1 ring-destructive/20",
				size === "sm"
					? "h-4 min-w-4 px-1 text-[10px]"
					: "h-5 min-w-5 px-1.5 text-[11px]",
				className,
			)}
		>
			{display}
		</span>
	);
}
