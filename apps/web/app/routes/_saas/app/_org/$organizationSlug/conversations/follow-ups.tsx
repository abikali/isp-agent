import { config } from "@repo/config";
import { BotFollowUpStats } from "@saas/ai-agents/components/BotFollowUpStats";
import { BotFollowUpsList } from "@saas/ai-agents/components/BotFollowUpsList";
import type { BotFollowUpTab } from "@saas/ai-agents/hooks/use-bot-follow-ups";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PageShell } from "@shared/components/PageShell";
import { PermissionGate } from "@shared/components/PermissionGate";
import { orpc } from "@shared/lib/orpc";
import { getServerQueryClient } from "@shared/lib/server";
import { dehydrate } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Skeleton } from "@ui/components/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@ui/components/tabs";

const TABS: Array<{ value: BotFollowUpTab; label: string }> = [
	{ value: "approval", label: "Awaiting approval" },
	{ value: "scheduled", label: "Scheduled" },
	{ value: "waiting", label: "Sent / waiting" },
	{ value: "done", label: "Done" },
];

function isTab(value: unknown): value is BotFollowUpTab {
	return TABS.some((t) => t.value === value);
}

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/conversations/follow-ups",
)({
	validateSearch: (search: Record<string, unknown>) => ({
		tab: isTab(search.tab) ? search.tab : ("approval" as BotFollowUpTab),
	}),
	loaderDeps: ({ search: { tab } }) => ({ tab }),
	loader: async ({ context, deps }) => {
		const { organization } = context;
		const queryClient = getServerQueryClient();
		await queryClient.ensureQueryData(
			orpc.aiAgents.botFollowUps.list.queryOptions({
				input: {
					organizationId: organization.id,
					tab: deps.tab,
					limit: 100,
				},
			}),
		);
		return {
			organizationId: organization.id,
			// react-doctor-disable-next-line react-doctor/no-json-parse-stringify-clone -- intentional SSR serialization of dehydrated query cache (strips non-serializable values for the client payload); canonical pattern per CLAUDE.md
			dehydratedState: JSON.parse(JSON.stringify(dehydrate(queryClient))),
		};
	},
	head: () => ({
		meta: [{ title: `Bot follow-ups - ${config.appName}` }],
	}),
	component: BotFollowUpsPage,
});

function BotFollowUpsPage() {
	const { organizationSlug } = Route.useParams();
	const { tab } = Route.useSearch();
	const { organizationId, dehydratedState } = Route.useLoaderData();
	const navigate = useNavigate({ from: Route.fullPath });

	return (
		<PermissionGate resource="aiAgents" action="read">
			<PageShell
				title="Bot follow-ups"
				description="Every follow-up the bot sends — nudges, check-backs after escalations and official-number outreach — with the customer's answer."
			>
				<div className="space-y-4">
					<BotFollowUpStats organizationId={organizationId} />
					<Tabs
						value={tab}
						onValueChange={(value) =>
							navigate({
								search: {
									tab: isTab(value) ? value : "approval",
								},
							})
						}
					>
						<TabsList>
							{TABS.map((t) => (
								<TabsTrigger key={t.value} value={t.value}>
									{t.label}
								</TabsTrigger>
							))}
						</TabsList>
					</Tabs>
					<AsyncBoundary
						key={tab}
						fallback={<Skeleton className="h-64 w-full" />}
						dehydratedState={dehydratedState}
					>
						<BotFollowUpsList
							organizationId={organizationId}
							organizationSlug={organizationSlug}
							tab={tab}
						/>
					</AsyncBoundary>
				</div>
			</PageShell>
		</PermissionGate>
	);
}
