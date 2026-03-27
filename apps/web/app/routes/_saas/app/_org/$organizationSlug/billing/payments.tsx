import { config } from "@repo/config";
import { PaymentsList, PaymentsListSkeleton } from "@saas/billing/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/billing/payments",
)({
	head: () => ({
		meta: [{ title: `Payments - ${config.appName}` }],
	}),
	component: PaymentsPage,
});

function PaymentsPage() {
	return (
		<AsyncBoundary fallback={<PaymentsListSkeleton />}>
			<PaymentsList />
		</AsyncBoundary>
	);
}
