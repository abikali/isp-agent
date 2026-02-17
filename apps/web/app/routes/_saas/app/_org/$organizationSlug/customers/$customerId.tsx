import { config } from "@repo/config";
import { CustomerDetail } from "@saas/customers/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@ui/components/skeleton";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/customers/$customerId",
)({
	head: () => ({
		meta: [{ title: `Customer Details - ${config.appName}` }],
	}),
	component: CustomerDetailPage,
});

function CustomerDetailPage() {
	const { customerId, organizationSlug } = Route.useParams();

	return (
		<AsyncBoundary fallback={<Skeleton className="h-96" />}>
			<CustomerDetail
				customerId={customerId}
				organizationSlug={organizationSlug}
			/>
		</AsyncBoundary>
	);
}
