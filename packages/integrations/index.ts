/**
 * @repo/integrations
 *
 * Shared integration utilities for connecting to third-party services.
 * This package provides a centralized Nango client that supports both
 * Nango Cloud and self-hosted instances.
 */

export {
	getNangoClient,
	getNangoHost,
	isNangoConfigured,
	resetNangoClient,
} from "./src/nango";
