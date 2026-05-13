import { config } from "@repo/config";
import { DashboardContent, DashboardSkeleton } from "@saas/dashboard/client";
import {
	useActiveOrganization,
	useCanAccess,
	usePermissionScope,
} from "@saas/organizations/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PageShell } from "@shared/components/PageShell";
import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_saas/app/_org/$organizationSlug/")({
	loader: async ({ context }) => {
		const { organization } = context;
		return {
			organizationId: organization.id,
		};
	},
	head: () => ({
		meta: [{ title: `Dashboard - ${config.appName}` }],
	}),
	component: DashboardPage,
});

function DashboardPage() {
	const { organizationSlug } = Route.useParams();
	const loaderData = Route.useLoaderData();
	const { isOrganizationAdmin, permissions } = useActiveOrganization();
	const hasPermission = useCanAccess();
	const getScope = usePermissionScope();

	// Permissions loaded when not empty OR user is admin (admins have system-level perms)
	const permissionsLoaded =
		isOrganizationAdmin || Object.keys(permissions).length > 0;

	// Show skeleton until permissions are loaded — prevents firing unauthorized queries
	if (!permissionsLoaded) {
		return <DashboardSkeleton />;
	}

	// Dashboard requires full customer read access (not just :own)
	const canViewDashboard =
		isOrganizationAdmin || getScope("customers", "read") === "all";
	const canCollectBilling = hasPermission("billing", "collect");

	if (!canViewDashboard && canCollectBilling) {
		return (
			<Navigate
				to="/app/$organizationSlug/billing/collect"
				params={{ organizationSlug }}
			/>
		);
	}

	if (!canViewDashboard) {
		return (
			<PageShell title="Dashboard">
				<div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
					You don&apos;t have access to the dashboard.
				</div>
			</PageShell>
		);
	}

	return (
		<PageShell
			title="Dashboard"
			description="At-a-glance view of revenue, customers, escalations, and watchers."
		>
			<AsyncBoundary fallback={<DashboardSkeleton />}>
				<DashboardContent
					organizationSlug={organizationSlug}
					organizationId={loaderData.organizationId}
				/>
			</AsyncBoundary>
		</PageShell>
	);
}
