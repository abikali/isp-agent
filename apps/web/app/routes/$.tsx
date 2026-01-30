import { config } from "@repo/config";
import { createFileRoute, Link } from "@tanstack/react-router";

/**
 * Catch-all route for unmatched paths.
 * This ensures that any unknown route renders our custom 404 page
 * instead of Nitro's default "Cannot GET" error.
 */
export const Route = createFileRoute("/$")({
	component: NotFoundPage,
});

function NotFoundPage() {
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
						<Link
							to="/"
							className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
						>
							Go to Homepage
						</Link>
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
				<Link to={"/legal/privacy-policy" as "/"}>Privacy Policy</Link>
				<span className="mx-2 opacity-50">|</span>
				<Link to={"/legal/terms" as "/"}>Terms</Link>
			</footer>
		</div>
	);
}
