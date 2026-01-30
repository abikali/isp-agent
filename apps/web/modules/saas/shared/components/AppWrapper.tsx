"use client";

import { config } from "@repo/config";
import { cn } from "@ui/lib";
import type { PropsWithChildren } from "react";
import { NavBar } from "./NavBar";

export function AppWrapper({ children }: PropsWithChildren) {
	return (
		<div className="min-h-screen bg-background">
			<NavBar />
			<div
				className={cn("flex py-4 md:pr-4", {
					"min-h-screen md:ml-[280px]":
						config.ui.saas.useSidebarLayout,
				})}
			>
				<main className="min-h-full w-full rounded-xl border border-border bg-card text-card-foreground px-4 py-6 md:p-8">
					<div className="container px-0">{children}</div>
				</main>
			</div>
		</div>
	);
}
