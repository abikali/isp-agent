import { config } from "@repo/config";
import { PaymentsList } from "@saas/billing/client";
import { PermissionGate } from "@shared/components/PermissionGate";
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
		<PermissionGate resource="billing" action="manage">
			<PaymentsList />
		</PermissionGate>
	);
}
