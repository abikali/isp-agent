"use client";

import { authClient } from "@repo/auth/client";
import { useActiveOrganization } from "@saas/organizations/client";
import { useTheme } from "@shared/hooks/use-theme";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { Button } from "@ui/components/button";
import { cn } from "@ui/lib";
import { LogOutIcon, ReceiptTextIcon, UsersIcon } from "lucide-react";
import { type PropsWithChildren, useEffect, useRef } from "react";

async function handleLogout() {
	await authClient.signOut();
	window.location.href = new URL("/login", window.location.origin).toString();
}

export function CollectorShell({ children }: PropsWithChildren) {
	const { activeOrganization, employee } = useActiveOrganization();
	const { theme, setTheme } = useTheme();
	const previousTheme = useRef(theme);

	// Force light mode for collector portal
	// biome-ignore lint/correctness/useExhaustiveDependencies: only run on mount/unmount to toggle theme
	useEffect(() => {
		previousTheme.current = theme;
		setTheme("light");

		return () => {
			setTheme(previousTheme.current);
		};
		// react-doctor-disable-next-line react-doctor/exhaustive-deps -- intentional mount/unmount-only effect: captures the initial theme, forces light for the collector portal, and restores on unmount; adding theme/setTheme would re-run on every theme change and fight the user
	}, []);

	const matchRoute = useMatchRoute();
	const orgSlug = activeOrganization?.slug ?? "";
	const params = { organizationSlug: orgSlug };
	const isHome = matchRoute({
		to: "/collect/$organizationSlug",
		params,
		fuzzy: false,
	});
	const isPayments = matchRoute({
		to: "/collect/$organizationSlug/payments",
		params,
		fuzzy: false,
	});

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
					<Link
						to="/collect/$organizationSlug"
						params={params}
						className={cn(
							"flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors",
							isHome
								? "border-b-2 border-primary text-primary"
								: "text-muted-foreground",
						)}
					>
						<UsersIcon className="size-4" />
						Collect
					</Link>
					<Link
						to="/collect/$organizationSlug/payments"
						params={params}
						className={cn(
							"flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors",
							isPayments
								? "border-b-2 border-primary text-primary"
								: "text-muted-foreground",
						)}
					>
						<ReceiptTextIcon className="size-4" />
						My Payments
					</Link>
				</nav>
			</header>

			{/* Main content — full width, no sidebar */}
			<main className="px-4 py-4">{children}</main>
		</div>
	);
}
