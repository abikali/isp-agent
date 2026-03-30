import { config } from "@repo/config";
import {
	NoteCategoriesSettings,
	NoteCategoriesSettingsSkeleton,
} from "@saas/settings/client";
import { SettingsList } from "@saas/shared/components/SettingsList";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/settings/note-categories",
)({
	head: () => ({
		meta: [{ title: `Note Categories - ${config.appName}` }],
	}),
	component: NoteCategoriesPage,
});

function NoteCategoriesPage() {
	return (
		<SettingsList>
			<AsyncBoundary fallback={<NoteCategoriesSettingsSkeleton />}>
				<NoteCategoriesSettings />
			</AsyncBoundary>
		</SettingsList>
	);
}
