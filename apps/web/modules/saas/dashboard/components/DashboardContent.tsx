"use client";

import { useSession } from "@saas/auth/client";
import { useActiveOrganization } from "@saas/organizations/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { ChartSkeleton } from "@shared/components/ChartSkeleton";
import { PageShell } from "@shared/components/PageShell";
import { BEIRUT_TIMEZONE } from "@shared/lib/format";
import { QuickActions } from "./QuickActions";
import { StatCards } from "./StatCards";
import { TrendsRow } from "./TrendsRow";

const BEIRUT_HOUR_FORMAT = new Intl.DateTimeFormat("en-GB", {
	timeZone: BEIRUT_TIMEZONE,
	hour: "numeric",
	hourCycle: "h23",
});

interface DashboardContentProps {
	organizationSlug: string;
	organizationId: string | null;
}

function getGreeting(): string {
	const hour = Number(BEIRUT_HOUR_FORMAT.format(new Date()));
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
			<AsyncBoundary fallback={<ChartSkeleton variant="line" />}>
				<TrendsRow />
			</AsyncBoundary>
		</PageShell>
	);
}
