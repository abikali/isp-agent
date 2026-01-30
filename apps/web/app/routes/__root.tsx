/// <reference types="vite/client" />
import { config } from "@repo/config";
import { NavigationProgress } from "@shared/components/NavigationProgress";
import { ThemeProvider } from "@shared/components/ThemeProvider";
import { themeScript } from "@shared/stores/theme-store";
import {
	keepPreviousData,
	QueryClient,
	QueryClientProvider,
} from "@tanstack/react-query";
import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import { Toaster } from "@ui/components/toast";
import React, { Suspense, useState } from "react";

// Lazy load devtools - only bundled in development
const ReactQueryDevtools = import.meta.env.DEV
	? React.lazy(() =>
			import("@tanstack/react-query-devtools").then((m) => ({
				default: m.ReactQueryDevtools,
			})),
		)
	: () => null;

const TanStackRouterDevtools = import.meta.env.DEV
	? React.lazy(() =>
			import("@tanstack/react-router-devtools").then((m) => ({
				default: m.TanStackRouterDevtools,
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
				content: "width=device-width, initial-scale=1",
			},
			{ title: config.appName },
		],
		links: [
			// Preload CSS for faster initial render (prevents FOUC)
			{ rel: "preload", href: appCss, as: "style" },
			{ rel: "stylesheet", href: appCss },
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
					<NavigationProgress />
					<Outlet />
					<Toaster position="top-center" closeButton />
				</ThemeProvider>
				<Suspense fallback={null}>
					<ReactQueryDevtools buttonPosition="bottom-left" />
				</Suspense>
			</QueryClientProvider>
		</RootDocument>
	);
}

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<HeadContent />
				{/* Theme script to prevent flash of wrong theme */}
				{/* biome-ignore lint/security/noDangerouslySetInnerHtml: Required for theme initialization before hydration */}
				<script dangerouslySetInnerHTML={{ __html: themeScript }} />
			</head>
			<body className="min-h-screen bg-background text-foreground antialiased">
				{children}
				<Suspense fallback={null}>
					<TanStackRouterDevtools position="bottom-right" />
				</Suspense>
				<Scripts />
			</body>
		</html>
	);
}

function GlobalErrorComponent({ error }: { error: Error }) {
	return (
		<RootDocument>
			<div className="flex min-h-screen flex-col bg-gradient-to-br from-background to-muted">
				<main className="flex flex-1 items-center justify-center p-4">
					<div className="w-full max-w-md space-y-6 text-center">
						<div className="mx-auto flex size-20 items-center justify-center rounded-full bg-destructive/10">
							<svg
								aria-hidden="true"
								className="size-10 text-destructive"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								strokeWidth={1.5}
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
								/>
							</svg>
						</div>

						<div className="space-y-2">
							<h1 className="text-2xl font-semibold tracking-tight">
								Something went wrong
							</h1>
							<p className="text-muted-foreground">
								We encountered an unexpected error. Please try
								again or contact support if the problem
								persists.
							</p>
						</div>

						{import.meta.env.DEV && error?.message && (
							<div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-left">
								<p className="mb-1 text-xs font-medium text-destructive">
									Error details (dev only)
								</p>
								<pre className="overflow-auto text-xs text-muted-foreground">
									{error.message}
								</pre>
							</div>
						)}

						<div className="flex flex-col gap-3 pt-2">
							<button
								type="button"
								onClick={() => window.location.reload()}
								className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
							>
								<svg
									aria-hidden="true"
									className="mr-2 size-4"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									strokeWidth={2}
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
									/>
								</svg>
								Reload page
							</button>
							<a
								href="/"
								className="inline-flex h-10 items-center justify-center rounded-md border bg-background px-6 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
							>
								Go to Homepage
							</a>
						</div>
					</div>
				</main>

				<footer className="py-6 text-center text-xs text-muted-foreground">
					<span>
						© {new Date().getFullYear()} {config.appName}
					</span>
					<span className="mx-2 opacity-50">|</span>
					<a href="/legal/privacy-policy">Privacy Policy</a>
					<span className="mx-2 opacity-50">|</span>
					<a href="/legal/terms">Terms</a>
				</footer>
			</div>
		</RootDocument>
	);
}

function NotFoundComponent() {
	return (
		<div className="flex min-h-screen flex-col bg-gradient-to-br from-background to-muted">
			<main className="flex flex-1 items-center justify-center p-4">
				<div className="w-full max-w-md space-y-6 text-center">
					<div className="mx-auto flex size-20 items-center justify-center rounded-full bg-muted">
						<svg
							aria-hidden="true"
							className="size-10 text-muted-foreground"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={1.5}
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
							/>
						</svg>
					</div>

					<div className="space-y-2">
						<p className="text-6xl font-bold text-muted-foreground/50">
							404
						</p>
						<h1 className="text-2xl font-semibold tracking-tight">
							Page not found
						</h1>
						<p className="text-muted-foreground">
							The page you're looking for doesn't exist or has
							been moved.
						</p>
					</div>

					<div className="flex flex-col gap-3 pt-2">
						<a
							href="/"
							className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
						>
							Go to Homepage
						</a>
						<button
							type="button"
							onClick={() => window.history.back()}
							className="inline-flex h-10 items-center justify-center rounded-md border bg-background px-6 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
						>
							<svg
								aria-hidden="true"
								className="mr-2 size-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								strokeWidth={2}
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
								/>
							</svg>
							Go back
						</button>
					</div>
				</div>
			</main>

			<footer className="py-6 text-center text-xs text-muted-foreground">
				<span>
					© {new Date().getFullYear()} {config.appName}
				</span>
				<span className="mx-2 opacity-50">|</span>
				<a href="/legal/privacy-policy">Privacy Policy</a>
				<span className="mx-2 opacity-50">|</span>
				<a href="/legal/terms">Terms</a>
			</footer>
		</div>
	);
}
