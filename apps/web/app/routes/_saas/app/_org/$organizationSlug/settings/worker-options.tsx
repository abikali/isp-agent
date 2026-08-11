import { config } from "@repo/config";
import { SettingsList } from "@saas/shared/components/SettingsList";
import {
	WorkerOptionsSettings,
	WorkerOptionsSettingsSkeleton,
} from "@saas/worker-options/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/settings/worker-options",
)({
	head: () => ({
		meta: [{ title: `Worker Dropdowns - ${config.appName}` }],
	}),
	component: WorkerOptionsPage,
});

function WorkerOptionsPage() {
	return (
		<SettingsList>
			<AsyncBoundary fallback={<WorkerOptionsSettingsSkeleton />}>
				<WorkerOptionsSettings />
			</AsyncBoundary>
		</SettingsList>
	);
}
