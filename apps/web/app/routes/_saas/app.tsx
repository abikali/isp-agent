import { config } from "@repo/config";
import { createPurchasesHelper } from "@repo/payments/lib/helper";
import { AppNotFound, AppWrapper } from "@saas/shared/client";
import { orpcClient } from "@shared/lib/orpc";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { attemptAsync } from "es-toolkit";

export const Route = createFileRoute("/_saas/app")({
	beforeLoad: async ({ context }) => {
		const { session, organizations } = context;

		// Check onboarding
		if (config.users.enableOnboarding && !session.user.onboardingComplete) {
			throw redirect({ to: "/onboarding" });
		}

		// Check if organization is required
		if (
			config.organizations.enable &&
			config.organizations.requireOrganization
		) {
			const organization =
				organizations?.find(
					(org) => org.id === session.session.activeOrganizationId,
				) || organizations?.[0];

			if (!organization) {
				throw redirect({ to: "/new-organization" });
			}
		}

		// Check billing requirements
		const hasFreePlan = Object.values(config.payments.plans).some(
			(plan) => "isFree" in plan,
		);

		if (
			((config.organizations.enable &&
				config.organizations.enableBilling) ||
				config.users.enableBilling) &&
			!hasFreePlan
		) {
			const organizationId = config.organizations.enable
				? session.session.activeOrganizationId ||
					organizations?.at(0)?.id
				: undefined;

			const [error, data] = await attemptAsync(() =>
				orpcClient.payments.listPurchases({
					organizationId,
				}),
			);

			if (error) {
				throw new Error("Failed to fetch purchases");
			}

			const purchases = data?.purchases ?? [];
			const { activePlan } = createPurchasesHelper(purchases);

			if (!activePlan) {
				throw redirect({ to: "/choose-plan" });
			}
		}

		// Return context for child routes to access
		return { session, organizations };
	},
	component: AppLayout,
	notFoundComponent: AppLayoutNotFound,
});

function AppLayoutNotFound() {
	return (
		<AppWrapper>
			<AppNotFound />
		</AppWrapper>
	);
}

function AppLayout() {
	return <Outlet />;
}
