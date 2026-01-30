import { config } from "@repo/config";
import { SignupForm } from "@saas/auth/components/SignupForm";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

interface SignupSearch {
	invitationId?: string;
	redirect?: string;
}

const getInvitationFn = createServerFn({ method: "GET" })
	.inputValidator((data: { invitationId: string }) => data)
	.handler(async ({ data }) => {
		// Dynamic import to prevent server code from being bundled for client
		const { getInvitationById } = await import("@repo/database");
		const invitation = await getInvitationById(data.invitationId);

		if (
			!invitation ||
			invitation.status !== "pending" ||
			invitation.expiresAt.getTime() < Date.now()
		) {
			return null;
		}

		return invitation;
	});

export const Route = createFileRoute("/_auth/signup")({
	validateSearch: (search: Record<string, unknown>): SignupSearch => {
		return {
			invitationId: search.invitationId as string | undefined,
			redirect: search.redirect as string | undefined,
		};
	},
	beforeLoad: async ({ search }) => {
		const invitationId = search.invitationId;

		// If signup is disabled and no invitation, redirect to login
		if (!(config.auth.enableSignup || invitationId)) {
			throw redirect({
				to: "/login",
			});
		}
	},
	loader: async ({ location }) => {
		const search = location.search as SignupSearch;
		const invitationId = search.invitationId;

		if (invitationId) {
			const invitation = await getInvitationFn({
				data: { invitationId },
			});

			if (!invitation) {
				throw redirect({
					to: "/login",
				});
			}

			return { prefillEmail: invitation.email };
		}

		return { prefillEmail: undefined };
	},
	head: () => ({
		meta: [{ title: `Sign Up - ${config.appName}` }],
	}),
	component: SignupPage,
});

function SignupPage() {
	const { prefillEmail } = Route.useLoaderData();
	return <SignupForm prefillEmail={prefillEmail} />;
}
