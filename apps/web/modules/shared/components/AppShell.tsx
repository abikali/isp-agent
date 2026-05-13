"use client";

import { SidebarInset, SidebarProvider } from "@ui/components/sidebar";
import type { PropsWithChildren } from "react";
import { AppSidebar } from "./AppSidebar";
import { CommandPaletteProvider } from "./CommandPalette";

/**
 * The dashboard shell — collapsible sidebar + main content area + ⌘K palette.
 *
 * Surface model (Vercel-style):
 *   - SidebarProvider wraps everything (flex row).
 *   - AppSidebar renders the navigation (collapsible to icon rail).
 *   - SidebarInset is the main content surface; it's `bg-background` so the
 *     sidebar and content share one continuous near-black/near-white plane.
 *     Page-level chrome (PageShell header, content cards) defines the
 *     hierarchy via 1px alpha borders inside that plane.
 *
 * The sidebar's open/collapsed state is persisted via cookie automatically
 * by the shadcn primitive; ⌘B toggles it.
 */
export function AppShell({ children }: PropsWithChildren) {
	return (
		<CommandPaletteProvider>
			<SidebarProvider>
				<AppSidebar />
				<SidebarInset className="min-w-0 bg-background">
					{children}
				</SidebarInset>
			</SidebarProvider>
		</CommandPaletteProvider>
	);
}
