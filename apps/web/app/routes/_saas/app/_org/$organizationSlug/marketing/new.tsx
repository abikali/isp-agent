import { config } from "@repo/config";
import { BroadcastWizard } from "@saas/marketing/client";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";
import z from "zod";

// Optional preset from the fiber control room ("broadcast to these areas").
const searchSchema = z.object({
	name: z.string().optional(),
	groups: z.array(z.string()).optional(),
	landline: z.enum(["yes", "no", "unknown"]).optional(),
});

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/marketing/new",
)({
	head: () => ({
		meta: [{ title: `New Broadcast - ${config.appName}` }],
	}),
	validateSearch: searchSchema,
	component: NewBroadcastPage,
});

function NewBroadcastPage() {
	const { organizationSlug } = Route.useParams();
	const { name, groups, landline } = Route.useSearch();
	const preset =
		groups || landline
			? {
					...(name ? { name } : {}),
					audience: {
						type: "isp_customers",
						statuses: [],
						planIds: [],
						excludePlanIds: [],
						stationIds: [],
						collectorIds: [],
						groupNames: groups ?? [],
						connectionTypes: [],
						...(landline ? { landline } : {}),
					},
				}
			: undefined;
	return (
		<PermissionGate resource="marketing" action="send">
			<BroadcastWizard
				organizationSlug={organizationSlug}
				initial={preset}
			/>
		</PermissionGate>
	);
}
