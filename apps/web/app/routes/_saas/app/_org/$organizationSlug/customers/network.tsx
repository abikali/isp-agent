import { config } from "@repo/config";
import {
	AccessPointsList,
	AccessPointsListSkeleton,
	BasesList,
	BasesListSkeleton,
	StationsList,
	StationsListSkeleton,
} from "@saas/customers/client";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { PageShell } from "@shared/components/PageShell";
import { PermissionGate } from "@shared/components/PermissionGate";
import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/tabs";
import { Building2Icon, RadioTowerIcon, WifiIcon } from "lucide-react";

export const Route = createFileRoute(
	"/_saas/app/_org/$organizationSlug/customers/network",
)({
	head: () => ({
		meta: [{ title: `Network - ${config.appName}` }],
	}),
	component: NetworkPage,
});

function NetworkPage() {
	return (
		<PermissionGate resource="stations" action="read">
			<PageShell
				title="Network"
				description="Stations, access points, and bases"
			>
				<Tabs defaultValue="stations" className="space-y-4">
					<TabsList className="w-full justify-start sm:w-auto">
						<TabsTrigger value="stations" className="gap-1.5">
							<RadioTowerIcon className="size-3.5" />
							Stations
						</TabsTrigger>
						<TabsTrigger value="access-points" className="gap-1.5">
							<WifiIcon className="size-3.5" />
							Access Points
						</TabsTrigger>
						<TabsTrigger value="bases" className="gap-1.5">
							<Building2Icon className="size-3.5" />
							Bases
						</TabsTrigger>
					</TabsList>

					<TabsContent value="stations">
						<AsyncBoundary fallback={<StationsListSkeleton />}>
							<StationsList />
						</AsyncBoundary>
					</TabsContent>

					<TabsContent value="access-points">
						<PermissionGate resource="accessPoints" action="read">
							<AsyncBoundary
								fallback={<AccessPointsListSkeleton />}
							>
								<AccessPointsList />
							</AsyncBoundary>
						</PermissionGate>
					</TabsContent>

					<TabsContent value="bases">
						<PermissionGate resource="bases" action="read">
							<AsyncBoundary fallback={<BasesListSkeleton />}>
								<BasesList />
							</AsyncBoundary>
						</PermissionGate>
					</TabsContent>
				</Tabs>
			</PageShell>
		</PermissionGate>
	);
}
