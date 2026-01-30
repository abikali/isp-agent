"use client";
import { SettingsItem } from "@saas/shared/client";
import { PricingTable } from "./PricingTable";

export function ChangePlan({
	organizationId,
	userId,
	activePlanId,
}: {
	organizationId?: string | undefined;
	userId?: string | undefined;
	activePlanId?: string | undefined;
}) {
	return (
		<SettingsItem
			title="Change Plan"
			description="Upgrade or downgrade your subscription plan"
		>
			<PricingTable
				organizationId={organizationId}
				userId={userId}
				activePlanId={activePlanId}
			/>
		</SettingsItem>
	);
}
