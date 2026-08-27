/// <reference types="vite/client" />
import { config } from "@repo/config";
import { GlobalErrorComponent } from "@shared/components/GlobalErrorComponent";
import { NavigationProgress } from "@shared/components/NavigationProgress";
import { NotFoundComponent } from "@shared/components/NotFoundComponent";
import { RootDocument } from "@shared/components/RootDocument";
import { ThemeProvider } from "@shared/components/ThemeProvider";
import {
	keepPreviousData,
	QueryClient,
	QueryClientProvider,
} from "@tanstack/react-query";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Toaster } from "@ui/components/toast";
import { TooltipProvider } from "@ui/components/tooltip";
import React, { Suspense, useState } from "react";

// Lazy load devtools - only bundled in development
const ReactQueryDevtools = import.meta.env.DEV
	? React.lazy(() =>
			import("@tanstack/react-query-devtools").then((m) => ({
				default: m.ReactQueryDevtools,
			})),
		)
	: () => null;

// Import global styles as URL for proper SSR (prevents FOUC)
import appCss from "../globals.css?url";

function createQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 1000 * 60, // 1 minute
				retry: false,
				// Keep showing previous data while fetching new results
				// Prevents UI flickering when filters/search params change
				placeholderData: keepPreviousData,
			},
		},
	});
}

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1, maximum-scale=1",
			},
			{ title: config.appName },
		],
		links: [
			// Preload CSS for faster initial render (prevents FOUC)
			{ rel: "preload", href: appCss, as: "style" },
			{ rel: "stylesheet", href: appCss },
			// Fonts: Geist Sans + Geist Mono (Vercel-grade typography)
			{ rel: "preconnect", href: "https://fonts.googleapis.com" },
			{
				rel: "preconnect",
				href: "https://fonts.gstatic.com",
				crossOrigin: "anonymous",
			},
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap",
			},
			{ rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
			{
				rel: "icon",
				type: "image/png",
				sizes: "16x16",
				href: "/favicon-16x16.png",
			},
			{
				rel: "icon",
				type: "image/png",
				sizes: "32x32",
				href: "/favicon-32x32.png",
			},
			{
				rel: "apple-touch-icon",
				sizes: "180x180",
				href: "/apple-touch-icon.png",
			},
			{ rel: "manifest", href: "/site.webmanifest" },
		],
	}),
	component: RootComponent,
	errorComponent: GlobalErrorComponent,
	notFoundComponent: NotFoundComponent,
});

function RootComponent() {
	// Create QueryClient once per component instance
	// Server: new instance per request (component remounts)
	// Client: stable instance across re-renders (useState initializer)
	const [queryClient] = useState(() => createQueryClient());

	return (
		<RootDocument>
			<QueryClientProvider client={queryClient}>
				<ThemeProvider>
					<TooltipProvider delayDuration={300}>
						<NavigationProgress />
						<Outlet />
						<Toaster position="top-center" closeButton />
					</TooltipProvider>
				</ThemeProvider>
				<Suspense fallback={null}>
					<ReactQueryDevtools buttonPosition="bottom-left" />
				</Suspense>
			</QueryClientProvider>
		</RootDocument>
	);
}
