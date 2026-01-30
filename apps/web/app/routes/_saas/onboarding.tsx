import { config } from "@repo/config";
import { OnboardingForm } from "@saas/onboarding/client";
import { AuthWrapper } from "@saas/shared/client";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_saas/onboarding")({
	beforeLoad: ({ context }) => {
		const { session } = context;

		if (!config.users.enableOnboarding || session.user.onboardingComplete) {
			throw redirect({ to: "/app" });
		}
	},
	head: () => ({
		meta: [{ title: `Onboarding - ${config.appName}` }],
	}),
	component: OnboardingPage,
});

function OnboardingPage() {
	return (
		<AuthWrapper>
			<OnboardingForm />
		</AuthWrapper>
	);
}
