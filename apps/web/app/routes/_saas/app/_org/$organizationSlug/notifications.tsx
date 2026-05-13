import { config } from "@repo/config";
import { NotificationsPage } from "@saas/notifications/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { TableSkeleton } from "@shared/components/TableSkeleton";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/notifications",
)({
	head: () => ({
		meta: [{ title: `Notifications - ${config.appName}` }],
	}),
	component: NotificationsRoute,
});

function NotificationsRoute() {
	return (
		<AsyncBoundary fallback={<TableSkeleton rows={6} columns={1} />}>
			<NotificationsPage />
		</AsyncBoundary>
	);
}
