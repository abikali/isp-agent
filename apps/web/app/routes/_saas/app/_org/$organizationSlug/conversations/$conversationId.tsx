import { config } from "@repo/config";
import { ConversationDetailPanel } from "@saas/ai-agents/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@ui/components/skeleton";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/conversations/$conversationId",
)({
	loader: async ({ context }) => {
		const { organization } = context;
		return { organizationId: organization.id };
	},
	head: () => ({
		meta: [{ title: `Conversation - ${config.appName}` }],
	}),
	component: ConversationDetailPage,
});

function ConversationDetailPage() {
	const { organizationSlug, conversationId } = Route.useParams();
	const { organizationId } = Route.useLoaderData();

	return (
		<div className="h-[calc(100vh-130px)]">
			<AsyncBoundary
				fallback={
					<div className="space-y-4 p-4">
						<Skeleton className="h-8 w-48" />
						<Skeleton className="h-64 w-full" />
					</div>
				}
			>
				<ConversationDetailPanel
					conversationId={conversationId}
					organizationId={organizationId}
					organizationSlug={organizationSlug}
					fullPage
				/>
			</AsyncBoundary>
		</div>
	);
}
