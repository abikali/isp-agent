import * as Sentry from "@sentry/tanstackstart-react";

// Only enable Sentry on deployed environments, not localhost
const isDeployedEnv = process.env.NODE_ENV === "production";

Sentry.init({
	dsn: process.env.SENTRY_DSN,
	environment: process.env.NODE_ENV || "development",

	// Setting this option to true will send default PII data to Sentry.
	// For example, automatic IP address collection on events
	sendDefaultPii: true,

	// Performance monitoring - 20% of transactions
	tracesSampleRate: 0.2,

	// Only enable on deployed environments, not localhost
	enabled: !!process.env.SENTRY_DSN && isDeployedEnv,
});
