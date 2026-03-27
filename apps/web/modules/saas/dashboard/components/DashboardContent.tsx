"use client";

import { useSession } from "@saas/auth/client";
import { useActiveOrganization } from "@saas/organizations/client";
import { PageShell } from "@shared/components/PageShell";
import { QuickActions } from "./QuickActions";
import { StatCards } from "./StatCards";

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
		<PageShell
			title={`${greeting}${userName ? `, ${userName.split(" ")[0]}` : ""}`}
			description={`Welcome to ${activeOrganization?.name ?? "your organization"}`}
		>
			<StatCards />
			<QuickActions organizationSlug={organizationSlug} />
		</PageShell>
	);
}
