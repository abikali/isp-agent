import { config } from "@repo/config";
import { InvoicesList } from "@saas/billing/client";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/billing/invoices",
)({
	head: () => ({
		meta: [{ title: `Invoices - ${config.appName}` }],
	}),
	component: InvoicesPage,
});

function InvoicesPage() {
	return (
		<PermissionGate resource="billing" action="manage">
			<InvoicesList />
		</PermissionGate>
	);
}
