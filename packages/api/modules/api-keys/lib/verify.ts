import { db } from "@repo/database";
import { hashApiKey, isValidApiKeyFormat } from "./hash";

export interface ApiKeyVerificationResult {
	valid: boolean;
	apiKey?: {
		id: string;
		name: string;
		organizationId: string;
		permissions: string[];
	};
	error?: string;
}

/**
 * Verify an API key and return its details if valid
 */
export async function verifyApiKey(
	plainKey: string,
): Promise<ApiKeyVerificationResult> {
	// Validate format first
	if (!isValidApiKeyFormat(plainKey)) {
		return { valid: false, error: "Invalid API key format" };
	}

	// Hash the key for lookup
	const keyHash = hashApiKey(plainKey);

	// Find the key in the database
	const apiKey = await db.apiKey.findUnique({
		where: { keyHash },
		select: {
			id: true,
			name: true,
			organizationId: true,
			permissions: true,
			expiresAt: true,
			revokedAt: true,
		},
	});

	if (!apiKey) {
		return { valid: false, error: "API key not found" };
	}

	// Check if revoked
	if (apiKey.revokedAt) {
		return { valid: false, error: "API key has been revoked" };
	}

	// Check if expired
	if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
		return { valid: false, error: "API key has expired" };
	}

	// Update last used timestamp (non-blocking)
	db.apiKey
		.update({
			where: { id: apiKey.id },
			data: { lastUsedAt: new Date() },
		})
		.catch(() => {
			// Ignore update errors - not critical
		});

	return {
		valid: true,
		apiKey: {
			id: apiKey.id,
			name: apiKey.name,
			organizationId: apiKey.organizationId,
			permissions: apiKey.permissions,
		},
	};
}

/**
 * Check if an API key has a specific permission
 */
export function hasPermission(
	permissions: string[],
	requiredPermission: string,
): boolean {
	// Wildcard permission grants all
	if (permissions.includes("*")) {
		return true;
	}

	// Check for exact match
	if (permissions.includes(requiredPermission)) {
		return true;
	}

	// Check for wildcard patterns (e.g., "read:*" matches "read:users")
	const [action, resource] = requiredPermission.split(":");
	if (resource && permissions.includes(`${action}:*`)) {
		return true;
	}

	return false;
}
