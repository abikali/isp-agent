import { config } from "@repo/config";
import { SuppressionList } from "@saas/marketing/client";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/marketing/opt-outs",
)({
	head: () => ({
		meta: [{ title: `Marketing opt-outs - ${config.appName}` }],
	}),
	component: MarketingOptOutsPage,
});

function MarketingOptOutsPage() {
	const { organizationSlug } = Route.useParams();
	return (
		<PermissionGate resource="marketing" action="read">
			<SuppressionList organizationSlug={organizationSlug} />
		</PermissionGate>
	);
}
