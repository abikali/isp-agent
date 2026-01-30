/**
 * Re-export Nango client utilities from the shared @repo/integrations package.
 * This ensures a single source of truth for Nango configuration.
 */
export {
	getNangoClient,
	getNangoHost,
	isNangoConfigured,
	resetNangoClient,
} from "@repo/integrations";
