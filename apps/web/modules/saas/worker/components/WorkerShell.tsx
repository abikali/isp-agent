"use client";

import { authClient } from "@repo/auth/client";
import { useActiveOrganization } from "@saas/organizations/client";
import { useTheme } from "@shared/hooks/use-theme";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { Button } from "@ui/components/button";
import { cn } from "@ui/lib";
import {
	BoxesIcon,
	ClipboardListIcon,
	HomeIcon,
	LogOutIcon,
	ReceiptIcon,
	UserPlusIcon,
} from "lucide-react";
import { type PropsWithChildren, useEffect, useRef } from "react";

const TABS = [
	{
		to: "/work/$organizationSlug",
		label: "Home",
		icon: HomeIcon,
		exact: true,
	},
	{
		to: "/work/$organizationSlug/tasks",
		label: "Tasks",
		icon: ClipboardListIcon,
	},
	{ to: "/work/$organizationSlug/stock", label: "Stock", icon: BoxesIcon },
	{
		to: "/work/$organizationSlug/new-customer",
		label: "New",
		icon: UserPlusIcon,
	},
	{
		to: "/work/$organizationSlug/expenses",
		label: "Expenses",
		icon: ReceiptIcon,
	},
] as const;

async function handleLogout() {
	await authClient.signOut();
	window.location.href = new URL("/login", window.location.origin).toString();
}

export function WorkerShell({ children }: PropsWithChildren) {
	const { activeOrganization, employee } = useActiveOrganization();
	const { theme, setTheme } = useTheme();
	const previousTheme = useRef(theme);

	// Force light mode for the worker portal (matches the collector portal)
	// biome-ignore lint/correctness/useExhaustiveDependencies: only run on mount/unmount to toggle theme
	useEffect(() => {
		previousTheme.current = theme;
		setTheme("light");

		return () => {
			setTheme(previousTheme.current);
		};
		// react-doctor-disable-next-line react-doctor/exhaustive-deps -- mount-only theme toggle; depending on theme/setTheme would re-run and fight the user's choice
	}, []);

	const matchRoute = useMatchRoute();
	const orgSlug = activeOrganization?.slug ?? "";
	const params = { organizationSlug: orgSlug };

	return (
		<div className="min-h-[100dvh] bg-muted/30">
			{/* Top bar */}
			<header className="sticky top-0 z-30 bg-background">
				<div className="flex items-center justify-between border-b px-4 py-3">
					<div className="min-w-0">
						<h1 className="truncate text-base font-semibold">
							{activeOrganization?.name ?? ""}
						</h1>
						{employee && (
							<p className="truncate text-xs text-muted-foreground">
								{employee.name}
							</p>
						)}
					</div>
					<Button
						variant="ghost"
						size="icon"
						onClick={handleLogout}
						className="shrink-0"
						aria-label="Logout"
					>
						<LogOutIcon className="size-4" />
					</Button>
				</div>
				{/* Navigation tabs */}
				<nav className="flex border-b">
					{TABS.map((tab) => {
						const active = matchRoute({
							to: tab.to,
							params,
							fuzzy: false,
						});
						return (
							<Link
								key={tab.to}
								to={tab.to}
								params={params}
								className={cn(
									"flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
									active
										? "border-b-2 border-primary bg-primary/5 text-primary"
										: "text-muted-foreground active:bg-muted",
								)}
							>
								<tab.icon className="size-5" />
								{tab.label}
							</Link>
						);
					})}
				</nav>
			</header>

			{/* Main content — full width, no sidebar */}
			<main className="px-4 py-4">{children}</main>
		</div>
	);
}
