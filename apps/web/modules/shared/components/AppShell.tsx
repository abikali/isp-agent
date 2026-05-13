"use client";

import { SidebarInset, SidebarProvider } from "@ui/components/sidebar";
import type { PropsWithChildren } from "react";
import { AppSidebar } from "./AppSidebar";
import { CommandPaletteProvider } from "./CommandPalette";

/**
 * The new dashboard shell.
 *
 * Replaces the legacy AppWrapper (top-bar / left-rail with a card-in-card
 * content area) with a collapsible shadcn Sidebar + flat content surface +
 * global ⌘K command palette.
 *
 * Each page renders its own sticky PageHeader/PageShell inside this shell.
 * The sidebar's open/collapsed state is persisted via cookie automatically
 * by the shadcn primitive; ⌘B toggles it.
 */
export function AppShell({ children }: PropsWithChildren) {
	return (
		<CommandPaletteProvider>
			<SidebarProvider>
				<AppSidebar />
				<SidebarInset className="min-w-0">
					<div className="flex flex-1 flex-col">{children}</div>
				</SidebarInset>
			</SidebarProvider>
		</CommandPaletteProvider>
	);
}
