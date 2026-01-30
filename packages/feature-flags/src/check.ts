import { db } from "@repo/database";

interface CheckOptions {
	userId?: string;
	organizationId?: string;
}

/**
 * Check if a feature flag is enabled for a given user/organization
 */
export async function isFeatureEnabled(
	key: string,
	options: CheckOptions = {},
): Promise<boolean> {
	const { userId, organizationId } = options;

	const flag = await db.featureFlag.findUnique({
		where: { key },
	});

	if (!flag) {
		return false;
	}

	if (!flag.enabled) {
		return false;
	}

	// Check if user is specifically targeted
	if (userId && flag.targetUsers.includes(userId)) {
		return true;
	}

	// Check if organization is specifically targeted
	if (organizationId && flag.targetOrgs.includes(organizationId)) {
		return true;
	}

	// If there are specific targets and the user/org isn't in them, return false
	if (flag.targetUsers.length > 0 || flag.targetOrgs.length > 0) {
		// Only enable for targeted users/orgs
		const isTargeted =
			(userId && flag.targetUsers.includes(userId)) ||
			(organizationId && flag.targetOrgs.includes(organizationId));
		if (!isTargeted) {
			return false;
		}
	}

	// Apply percentage rollout
	if (flag.percentage < 100) {
		// Use a deterministic hash based on the key and user/org for consistent results
		const identifier = userId || organizationId || "anonymous";
		const hash = simpleHash(`${key}:${identifier}`);
		const bucket = hash % 100;
		return bucket < flag.percentage;
	}

	return true;
}

/**
 * Get all enabled feature flags for a user/organization
 */
export async function getEnabledFeatures(
	options: CheckOptions = {},
): Promise<string[]> {
	const { userId, organizationId } = options;

	const flags = await db.featureFlag.findMany({
		where: { enabled: true },
	});

	const enabledFlags: string[] = [];

	for (const flag of flags) {
		// Check if user is specifically targeted
		if (userId && flag.targetUsers.includes(userId)) {
			enabledFlags.push(flag.key);
			continue;
		}

		// Check if organization is specifically targeted
		if (organizationId && flag.targetOrgs.includes(organizationId)) {
			enabledFlags.push(flag.key);
			continue;
		}

		// If there are specific targets, skip non-targeted
		if (flag.targetUsers.length > 0 || flag.targetOrgs.length > 0) {
			continue;
		}

		// Apply percentage rollout
		if (flag.percentage < 100) {
			const identifier = userId || organizationId || "anonymous";
			const hash = simpleHash(`${flag.key}:${identifier}`);
			const bucket = hash % 100;
			if (bucket >= flag.percentage) {
				continue;
			}
		}

		enabledFlags.push(flag.key);
	}

	return enabledFlags;
}

/**
 * Simple deterministic hash function for consistent rollout bucketing
 */
function simpleHash(str: string): number {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash; // Convert to 32bit integer
	}
	return Math.abs(hash);
}
