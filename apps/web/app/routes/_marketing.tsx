import { Footer } from "@marketing/shared/components/Footer";
import { NavBar } from "@marketing/shared/components/NavBar";
import { SessionProvider } from "@saas/auth/client";
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_marketing")({
	component: MarketingLayout,
});

function MarketingLayout() {
	return (
		// Session fetched client-side to avoid blocking SSR on marketing pages
		<SessionProvider>
			<NavBar />
			<main className="min-h-screen">
				<Outlet />
			</main>
			<Footer />
		</SessionProvider>
	);
}
