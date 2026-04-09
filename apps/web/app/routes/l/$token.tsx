import { LocationRequestPage } from "@saas/customers/client";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/l/$token")({
	component: LocationRequestRoute,
});

function LocationRequestRoute() {
	const { token } = Route.useParams();
	return <LocationRequestPage token={token} />;
}
