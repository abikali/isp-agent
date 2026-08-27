import { themeScript } from "@shared/stores/theme-store";
import { HeadContent, Scripts } from "@tanstack/react-router";
import React, { Suspense } from "react";

// Lazy load devtools - only bundled in development
const TanStackRouterDevtools = import.meta.env.DEV
	? React.lazy(() =>
			import("@tanstack/react-router-devtools").then((m) => ({
				default: m.TanStackRouterDevtools,
			})),
		)
	: () => null;

export function RootDocument({ children }: { children: React.ReactNode }) {
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
