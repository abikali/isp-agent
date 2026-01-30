"use client";

import { config } from "@repo/config";
import { cn } from "@ui/lib";
import type { PropsWithChildren } from "react";
import { NavBar } from "./NavBar";

/**
 * Full-bleed variant of AppWrapper for pages that need to fill the entire viewport
 * without container padding (e.g., ProfileBuilder, editors, canvases)
 *
 * Uses flexbox for proper height distribution:
 * - Container is exactly viewport height (100dvh)
 * - NavBar takes its natural height
 * - Children fill remaining space with flex-1 and min-h-0
 *
 * On desktop with sidebar layout: NavBar is fixed 280px wide on left side.
 */
export function AppWrapperFullBleed({ children }: PropsWithChildren) {
	return (
		<div className="flex h-[100dvh] flex-col overflow-hidden bg-background">
			<NavBar />
			<main
				className={cn(
					"min-h-0 flex-1",
					config.ui.saas.useSidebarLayout && "md:ml-[280px]",
				)}
			>
				{children}
			</main>
		</div>
	);
}
