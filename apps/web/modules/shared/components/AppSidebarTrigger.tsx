"use client";

import { useNavBadges } from "@shared/hooks/use-nav-badges";
import { SidebarTrigger } from "@ui/components/sidebar";
import { cn } from "@ui/lib";

/**
 * The menu button for the off-canvas sidebar on phones. The sidebar's badges
 * are out of sight behind it, so it carries a dot while anything is waiting.
 */
export function AppSidebarTrigger({ className }: { className?: string }) {
	const { total } = useNavBadges();

	return (
		<span className={cn("relative inline-flex shrink-0", className)}>
			<SidebarTrigger />
			{total > 0 && (
				<>
					<span
						aria-hidden
						className="pointer-events-none absolute top-0.5 right-0.5 size-2 rounded-full bg-destructive ring-2 ring-background"
					/>
					<span className="sr-only">Items waiting for review</span>
				</>
			)}
		</span>
	);
}
