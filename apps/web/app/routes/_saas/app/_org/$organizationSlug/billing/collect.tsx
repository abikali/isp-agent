import { config } from "@repo/config";
import {
	UnpaidCustomersList,
	UnpaidCustomersListSkeleton,
} from "@saas/billing/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/billing/collect",
)({
	head: () => ({
		meta: [{ title: `Collect Payments - ${config.appName}` }],
	}),
	component: CollectPage,
});

function CollectPage() {
	return (
		<AsyncBoundary fallback={<UnpaidCustomersListSkeleton />}>
			<UnpaidCustomersList />
		</AsyncBoundary>
	);
}
