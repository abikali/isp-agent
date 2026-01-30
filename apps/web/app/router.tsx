import * as Sentry from "@sentry/tanstackstart-react";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
	const router = createRouter({
		routeTree,
		defaultPreload: "intent",
		defaultPreloadStaleTime: 0,
		scrollRestoration: true,
		defaultPendingMs: 150,
		defaultPendingMinMs: 100,
	});

	// Initialize Sentry on client only, and only on deployed environments (not localhost)
	if (!router.isServer && typeof window !== "undefined") {
		const hostname = window.location.hostname;
		const isLocalhost =
			hostname === "localhost" || hostname === "127.0.0.1";
		const isDeployedEnv = !isLocalhost;

		Sentry.init({
			dsn: import.meta.env.VITE_SENTRY_DSN,
			environment: import.meta.env.MODE,

			// Adds request headers and IP for users
			sendDefaultPii: true,

			// Browser tracing for Web Vitals (LCP, CLS, FCP, TTFB, INP) and navigation
			// Web Vitals are automatically captured by tanstackRouterBrowserTracingIntegration
			integrations: [
				Sentry.tanstackRouterBrowserTracingIntegration(router),
			],

			// Performance monitoring - 20% of transactions
			tracesSampleRate: 0.2,

			// Continuous profiling for detailed performance insights (Chromium browsers only)
			profileSessionSampleRate: 0.1,

			// Session replay rates (applied when replay is lazy-loaded)
			replaysSessionSampleRate: 0.1,
			replaysOnErrorSampleRate: 1.0,

			// Only enable on deployed environments (libancom.co), not localhost
			enabled: !!import.meta.env.VITE_SENTRY_DSN && isDeployedEnv,
		});

		// Lazy-load Session Replay and Browser Profiling after initial render
		// These add significant bundle size, so we load them asynchronously
		if (import.meta.env.VITE_SENTRY_DSN && isDeployedEnv) {
			import("@sentry/tanstackstart-react").then((lazySentry) => {
				// Session Replay for visual debugging of user sessions and errors
				Sentry.addIntegration(lazySentry.replayIntegration());

				// Browser Profiling for function-level performance analysis
				// Helps identify jank, frame drops, and slow functions
				Sentry.addIntegration(lazySentry.browserProfilingIntegration());
			});
		}
	}

	return router;
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
