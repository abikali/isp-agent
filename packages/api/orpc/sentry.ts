/**
 * Sentry error capture utility for the API package.
 * Dynamically imports Sentry to avoid issues when Sentry is not configured.
 */

let sentryModule: typeof import("@sentry/node") | null = null;
let sentryLoaded = false;

async function loadSentry() {
	if (sentryLoaded) {
		return sentryModule;
	}
	sentryLoaded = true;

	try {
		// Only load Sentry if DSN is configured
		if (process.env["SENTRY_DSN"]) {
			sentryModule = await import("@sentry/node");
		}
	} catch {
		// Sentry not available, continue without it
	}

	return sentryModule;
}

/**
 * Capture an exception with Sentry (if configured)
 */
export function captureException(error: unknown): void {
	// Fire and forget - don't block on Sentry
	loadSentry().then((sentry) => {
		sentry?.captureException(error);
	});
}

/**
 * Capture a message with Sentry (if configured)
 */
export function captureMessage(
	message: string,
	level: "fatal" | "error" | "warning" | "log" | "info" | "debug" = "info",
): void {
	loadSentry().then((sentry) => {
		sentry?.captureMessage(message, level);
	});
}

/**
 * Set user context for Sentry
 */
export function setUser(user: { id: string; email?: string } | null): void {
	loadSentry().then((sentry) => {
		sentry?.setUser(user);
	});
}

/**
 * Add breadcrumb for Sentry
 */
export function addBreadcrumb(breadcrumb: {
	message: string;
	category?: string;
	level?: "fatal" | "error" | "warning" | "log" | "info" | "debug";
	data?: Record<string, unknown>;
}): void {
	loadSentry().then((sentry) => {
		sentry?.addBreadcrumb(breadcrumb);
	});
}
