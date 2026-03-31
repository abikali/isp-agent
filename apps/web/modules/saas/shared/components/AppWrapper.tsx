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
				className={cn("flex px-2 py-4 sm:px-4 md:pr-4", {
					"min-h-screen md:ml-[280px] md:pl-0":
						config.ui.saas.useSidebarLayout,
				})}
			>
				<main className="min-h-full w-full rounded-xl bg-card px-3 py-5 shadow-card sm:px-4 sm:py-6 md:p-8">
					<div className="container px-0">{children}</div>
				</main>
			</div>
		</div>
	);
}
