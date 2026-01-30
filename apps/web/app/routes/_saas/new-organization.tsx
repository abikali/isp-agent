import { config } from "@repo/config";
import { CreateOrganizationForm } from "@saas/organizations/client";
import { AuthWrapper } from "@saas/shared/client";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_saas/new-organization")({
	beforeLoad: ({ context }) => {
		const { organizations } = context;

		if (
			!config.organizations.enable ||
			(!config.organizations.enableUsersToCreateOrganizations &&
				(!config.organizations.requireOrganization ||
					organizations.length > 0))
		) {
			throw redirect({ to: "/app" });
		}
	},
	head: () => ({
		meta: [{ title: `Create Organization - ${config.appName}` }],
	}),
	component: NewOrganizationPage,
});

function NewOrganizationPage() {
	return (
		<AuthWrapper>
			<CreateOrganizationForm />
		</AuthWrapper>
	);
}
