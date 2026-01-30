import { config } from "@repo/config";
import { OrganizationInvitationModal } from "@saas/organizations/client";
import { AuthWrapper } from "@saas/shared/client";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

const getInvitationFn = createServerFn({ method: "GET" })
	.inputValidator((data: { invitationId: string }) => data)
	.handler(async ({ data }) => {
		// Dynamic imports to prevent server code from being bundled for client
		const { authApi } = await import("@repo/auth");
		const { getOrganizationById } = await import("@repo/database");

		const request = getRequest();

		const invitation = await authApi.getInvitation({
			query: {
				id: data.invitationId,
			},
			headers: request.headers,
		});

		if (!invitation) {
			throw redirect({ to: "/app" });
		}

		const organization = await getOrganizationById(
			invitation.organizationId,
		);

		return {
			organizationName: invitation.organizationName,
			organizationSlug: invitation.organizationSlug,
			logoUrl: organization?.logo ?? undefined,
			invitationId: data.invitationId,
		};
	});

export const Route = createFileRoute(
	"/_saas/organization-invitation/$invitationId",
)({
	loader: ({ params }) =>
		getInvitationFn({ data: { invitationId: params.invitationId } }),
	head: () => ({
		meta: [{ title: `Organization Invitation - ${config.appName}` }],
	}),
	component: OrganizationInvitationPage,
});

function OrganizationInvitationPage() {
	const { organizationName, organizationSlug, logoUrl, invitationId } =
		Route.useLoaderData();

	return (
		<AuthWrapper>
			<OrganizationInvitationModal
				organizationName={organizationName}
				organizationSlug={organizationSlug}
				logoUrl={logoUrl}
				invitationId={invitationId}
			/>
		</AuthWrapper>
	);
}
