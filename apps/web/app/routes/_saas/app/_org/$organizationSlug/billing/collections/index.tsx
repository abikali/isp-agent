import { config } from "@repo/config";
import { CollectorPickerPage } from "@saas/billing/client";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/billing/collections/",
)({
	head: () => ({
		meta: [{ title: `Cash Collections - ${config.appName}` }],
	}),
	component: CollectionsPage,
});

function CollectionsPage() {
	const { organizationSlug } = Route.useParams();
	const basePath = `/app/${organizationSlug}/billing/collections`;

	return (
		<PermissionGate resource="billing" action="manage">
			<CollectorPickerPage basePath={basePath} />
		</PermissionGate>
	);
}
