import { config } from "@repo/config";
import { createPurchasesHelper } from "@repo/payments/lib/helper";
import { ActivePlan } from "@saas/payments/components/ActivePlan";
import { ChangePlan } from "@saas/payments/components/ChangePlan";
import { SettingsList } from "@saas/shared/components/SettingsList";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { orpc } from "@shared/lib/orpc";
import { getServerQueryClient } from "@shared/lib/server";
import { dehydrate } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@ui/components/skeleton";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/settings/billing",
)({
	loader: async ({ context }) => {
		const { organization } = context;
		const queryClient = getServerQueryClient();

		// Prefetch purchases into React Query cache
		const purchasesData = await queryClient.ensureQueryData(
			orpc.payments.listPurchases.queryOptions({
				input: { organizationId: organization.id },
			}),
		);

		const purchases = purchasesData?.purchases ?? [];
		const { activePlan } = createPurchasesHelper(purchases);

		return {
			dehydratedState: JSON.parse(JSON.stringify(dehydrate(queryClient))),
			organizationId: organization.id,
			activePlanId: activePlan?.id,
			hasActivePlan: !!activePlan,
		};
	},
	head: () => ({
		meta: [{ title: `Billing - ${config.appName}` }],
	}),
	component: OrganizationBillingPage,
});

function BillingSkeleton() {
	return (
		<div className="space-y-6">
			<Skeleton className="h-48 w-full" />
			<Skeleton className="h-96 w-full" />
		</div>
	);
}

function OrganizationBillingPage() {
	const { dehydratedState, organizationId, activePlanId, hasActivePlan } =
		Route.useLoaderData();

	return (
		<AsyncBoundary
			fallback={<BillingSkeleton />}
			dehydratedState={dehydratedState}
		>
			<SettingsList>
				{hasActivePlan && (
					<ActivePlan organizationId={organizationId} />
				)}
				<ChangePlan
					organizationId={organizationId}
					activePlanId={activePlanId}
				/>
			</SettingsList>
		</AsyncBoundary>
	);
}
