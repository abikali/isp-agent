import { Nango } from "@nangohq/node";
import { config } from "@repo/config";

/**
 * Lazy-initialized Nango client singleton.
 * The client is created on first use to avoid errors when env vars are missing in dev.
 * Supports both Nango Cloud and self-hosted instances.
 */
let nangoClient: Nango | null = null;

/**
 * Get the Nango client instance.
 * Uses a singleton pattern to reuse the same client across requests.
 *
 * @throws Error if NANGO_SECRET_KEY is not configured
 */
export function getNangoClient(): Nango {
	if (!nangoClient) {
		const secretKey = config.integrations.nango.secretKey;
		const host = config.integrations.nango.host;

		if (!secretKey) {
			throw new Error(
				"NANGO_SECRET_KEY environment variable is required for integrations",
			);
		}

		nangoClient = new Nango({
			secretKey,
			// Only add host if self-hosting (non-empty string)
			...(host && { host }),
		});
	}

	return nangoClient;
}

/**
 * Check if Nango is configured and available.
 * Returns true if either the secret key is set (required for API calls).
 */
export function isNangoConfigured(): boolean {
	return Boolean(config.integrations.nango.secretKey);
}

/**
 * Check if Nango is configured for self-hosting.
 * Returns the host URL if self-hosted, or null if using Nango Cloud.
 */
export function getNangoHost(): string | null {
	const host = config.integrations.nango.host;
	return host || null;
}

/**
 * Reset the Nango client singleton.
 * Useful for testing or when configuration changes.
 */
export function resetNangoClient(): void {
	nangoClient = null;
}
