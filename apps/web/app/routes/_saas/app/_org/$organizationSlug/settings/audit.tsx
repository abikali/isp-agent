import { config } from "@repo/config";
import { useActiveOrganization } from "@saas/organizations/client";
// Import directly to avoid circular dependency warnings in SSR build
import { AuditLogsBlock } from "@saas/organizations/components/AuditLogsBlock";
import { SettingsList } from "@saas/shared/client";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Search params schema for audit logs page.
 * Validated by TanStack Router on navigation.
 */
const auditLogsSearchSchema = z.object({
	page: z.number().default(1),
	action: z.string().default(""),
});

export type AuditLogsSearch = z.infer<typeof auditLogsSearchSchema>;

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/settings/audit",
)({
	validateSearch: auditLogsSearchSchema,
	head: () => ({
		meta: [{ title: `Audit Logs - ${config.appName}` }],
	}),
	component: OrganizationAuditPage,
});

function OrganizationAuditPage() {
	const { activeOrganization } = useActiveOrganization();

	if (!activeOrganization?.id) {
		return null;
	}

	return (
		<SettingsList>
			<AuditLogsBlock organizationId={activeOrganization.id} />
		</SettingsList>
	);
}
