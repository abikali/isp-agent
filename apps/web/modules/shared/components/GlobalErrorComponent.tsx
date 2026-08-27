import { config } from "@repo/config";
import { RootDocument } from "@shared/components/RootDocument";
import { getBeirutDate } from "@shared/lib/format";

export function GlobalErrorComponent({ error }: { error: Error }) {
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
							{/* react-doctor-disable-next-line react-doctor/tanstack-start-no-anchor-element -- error-boundary recovery: full reload intentionally resets crashed app/router state */}
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
						© {getBeirutDate().year} {config.appName}
					</span>
					<span className="mx-2 opacity-50">|</span>
					{/* react-doctor-disable-next-line react-doctor/tanstack-start-no-anchor-element -- /legal/* is served by a splat route (legal/$), not a typed Link target */}
					<a href="/legal/privacy-policy">Privacy Policy</a>
					<span className="mx-2 opacity-50">|</span>
					{/* react-doctor-disable-next-line react-doctor/tanstack-start-no-anchor-element -- /legal/* is served by a splat route (legal/$), not a typed Link target */}
					<a href="/legal/terms">Terms</a>
				</footer>
			</div>
		</RootDocument>
	);
}
