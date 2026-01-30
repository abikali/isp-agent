import { createHash, randomBytes } from "node:crypto";

/**
 * Generate a new API key
 * Returns the plain key (shown once to user) and the hash (stored in DB)
 */
export function generateApiKey(): {
	plainKey: string;
	keyHash: string;
	keyPrefix: string;
} {
	// Generate 32 random bytes (256 bits of entropy)
	const randomPart = randomBytes(32).toString("base64url");

	// Create the full key with a prefix for identification
	const plainKey = `libancom_${randomPart}`;

	// Hash the key for storage (SHA-256)
	const keyHash = createHash("sha256").update(plainKey).digest("hex");

	// Extract first 8 chars for identification
	const keyPrefix = plainKey.substring(0, 14); // "libancom_" + 8 chars

	return { plainKey, keyHash, keyPrefix };
}

/**
 * Hash an API key for lookup
 */
export function hashApiKey(plainKey: string): string {
	return createHash("sha256").update(plainKey).digest("hex");
}

/**
 * Validate API key format
 */
export function isValidApiKeyFormat(key: string): boolean {
	return /^libancom_[A-Za-z0-9_-]{43}$/.test(key);
}
