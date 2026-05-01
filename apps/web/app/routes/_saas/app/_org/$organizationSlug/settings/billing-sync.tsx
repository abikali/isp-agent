import { config } from "@repo/config";
import { BillingSyncSettings } from "@saas/settings/client";
import { SettingsList } from "@saas/shared/components/SettingsList";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/settings/billing-sync",
)({
	beforeLoad: ({ context, params }) => {
		if (context.session?.user?.role !== "admin") {
			throw redirect({
				to: "/app/$organizationSlug/settings/general",
				params: { organizationSlug: params.organizationSlug },
			});
		}
	},
	head: () => ({
		meta: [{ title: `Billing Sync - ${config.appName}` }],
	}),
	component: BillingSyncPage,
});

function BillingSyncPage() {
	return (
		<SettingsList>
			<BillingSyncSettings />
		</SettingsList>
	);
}
