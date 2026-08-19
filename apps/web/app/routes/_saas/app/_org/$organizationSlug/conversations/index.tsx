import { config } from "@repo/config";
import { ConversationsHub } from "@saas/ai-agents/client";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";
import { SidebarTrigger } from "@ui/components/sidebar";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/conversations/",
)({
	loader: async ({ context }) => {
		const { organization } = context;
		return { organizationId: organization.id };
	},
	head: () => ({
		meta: [{ title: `Conversations - ${config.appName}` }],
	}),
	component: ConversationsPage,
});

function ConversationsPage() {
	const { organizationSlug } = Route.useParams();
	const { organizationId } = Route.useLoaderData();

	return (
		<PermissionGate resource="aiAgents" action="read">
			<div className="flex h-svh flex-col p-2 md:p-3">
				{/* This page renders its own full-height shell instead of
				    PageShell, so nothing else provides the mobile sidebar
				    trigger — without it there is no way off the page on a
				    phone (the sidebar is an off-canvas sheet there). */}
				<div className="flex items-center gap-2 pb-2 md:hidden">
					<SidebarTrigger className="-ml-1" />
					<h1 className="font-semibold text-base">Conversations</h1>
				</div>
				<ConversationsHub
					organizationId={organizationId}
					organizationSlug={organizationSlug}
				/>
			</div>
		</PermissionGate>
	);
}
