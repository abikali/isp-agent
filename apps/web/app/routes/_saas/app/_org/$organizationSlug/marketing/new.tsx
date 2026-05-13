import { config } from "@repo/config";
import { CreateBroadcastWizard } from "@saas/marketing/client";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/marketing/new",
)({
	head: () => ({
		meta: [{ title: `New Broadcast - ${config.appName}` }],
	}),
	component: NewBroadcastPage,
});

function NewBroadcastPage() {
	const { organizationSlug } = Route.useParams();
	return (
		<PermissionGate resource="marketing" action="send">
			<CreateBroadcastWizard organizationSlug={organizationSlug} />
		</PermissionGate>
	);
}
