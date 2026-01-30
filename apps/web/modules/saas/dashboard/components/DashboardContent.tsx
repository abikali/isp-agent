"use client";

import { useSession } from "@saas/auth/client";
import { useActiveOrganization } from "@saas/organizations/client";
import { QuickActions } from "./QuickActions";

interface DashboardContentProps {
	organizationSlug: string;
	organizationId: string | null;
}

function getGreeting(): string {
	const hour = new Date().getHours();
	if (hour < 12) {
		return "Good morning";
	}
	if (hour < 18) {
		return "Good afternoon";
	}
	return "Good evening";
}

export function DashboardContent({
	organizationSlug,
	organizationId,
}: DashboardContentProps) {
	const { activeOrganization } = useActiveOrganization();
	const { user } = useSession();

	const userName = user?.name;

	if (!organizationId) {
		throw new Error("Organization not loaded");
	}

	const greeting = getGreeting();

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="space-y-1">
				<h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
					{greeting}
					{userName ? `, ${userName.split(" ")[0]}` : ""}
				</h1>
				<p className="text-muted-foreground">
					Welcome to {activeOrganization?.name ?? "your organization"}
				</p>
			</div>

			{/* Quick Actions */}
			<QuickActions organizationSlug={organizationSlug} />
		</div>
	);
}
