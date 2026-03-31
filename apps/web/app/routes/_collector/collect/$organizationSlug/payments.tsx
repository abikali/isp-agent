import {
	CollectorPayments,
	CollectorPaymentsSkeleton,
} from "@saas/billing/client";
import { useActiveOrganization } from "@saas/organizations/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_collector/collect/$organizationSlug/payments",
)({
	component: CollectorPaymentsPage,
});

function CollectorPaymentsPage() {
	const { activeOrganization } = useActiveOrganization();

	if (!activeOrganization) {
		return <CollectorPaymentsSkeleton />;
	}

	return (
		<AsyncBoundary fallback={<CollectorPaymentsSkeleton />}>
			<CollectorPayments />
		</AsyncBoundary>
	);
}
