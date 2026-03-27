"use client";

import { authClient } from "@repo/auth/client";
import { useActiveOrganization } from "@saas/organizations/client";
import { useRouter } from "@shared/hooks/router";
import { Button } from "@ui/components/button";
import { LogOutIcon } from "lucide-react";
import { type PropsWithChildren, useEffect } from "react";

export function CollectorShell({ children }: PropsWithChildren) {
	const { activeOrganization, employee } = useActiveOrganization();
	const router = useRouter();

	// Force light mode for collector portal
	useEffect(() => {
		const root = document.documentElement;
		const hadDark = root.classList.contains("dark");
		root.classList.remove("dark");
		root.classList.add("light");

		return () => {
			// Restore previous theme on unmount
			root.classList.remove("light");
			if (hadDark) {
				root.classList.add("dark");
			}
		};
	}, []);

	async function handleLogout() {
		await authClient.signOut();
		router.navigate({ to: "/login" });
	}

	return (
		<div className="min-h-[100dvh] bg-muted/30">
			{/* Simple top bar */}
			<header className="sticky top-0 z-30 border-b bg-background px-4 py-3">
				<div className="flex items-center justify-between">
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
			</header>

			{/* Main content — full width, no sidebar */}
			<main className="px-4 py-4">{children}</main>
		</div>
	);
}
