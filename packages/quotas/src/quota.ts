import { createId } from "@paralleldrive/cuid2";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { getPlanLimits, isUnlimited } from "./plans";
import type { QuotaCheckResult, QuotaIdentifier, QuotaType } from "./types";

/**
 * Get or create a usage quota record
 */
async function getOrCreateQuota(
	identifier: QuotaIdentifier,
	quotaType: QuotaType,
	limit: number,
) {
	const where =
		identifier.type === "organization"
			? {
					organizationId_quotaType: {
						organizationId: identifier.organizationId,
						quotaType,
					},
				}
			: { userId_quotaType: { userId: identifier.userId, quotaType } };

	const data =
		identifier.type === "organization"
			? {
					id: createId(),
					organizationId: identifier.organizationId,
					quotaType,
					limit,
					used: 0,
					updatedAt: new Date(),
				}
			: {
					id: createId(),
					userId: identifier.userId,
					quotaType,
					limit,
					used: 0,
					updatedAt: new Date(),
				};

	return db.usageQuota.upsert({
		where,
		create: data,
		update: {},
	});
}

/**
 * Check if an action is allowed within quota limits
 * Does not increment the counter
 */
export async function checkQuota(
	identifier: QuotaIdentifier,
	quotaType: QuotaType,
	planId = "free",
): Promise<QuotaCheckResult> {
	try {
		const limits = getPlanLimits(planId);
		const limit = limits[quotaType];

		// If unlimited, always allow
		if (isUnlimited(limit)) {
			return {
				allowed: true,
				used: 0,
				limit: -1,
				remaining: -1,
			};
		}

		const quota = await getOrCreateQuota(identifier, quotaType, limit);

		const result: QuotaCheckResult = {
			allowed: quota.used < limit,
			used: quota.used,
			limit,
			remaining: Math.max(0, limit - quota.used),
		};
		if (quota.resetAt) {
			result.resetAt = quota.resetAt;
		}
		return result;
	} catch (error) {
		logger.error("Failed to check quota", { error, identifier, quotaType });
		// Fail open - allow if quota check fails
		return {
			allowed: true,
			used: 0,
			limit: -1,
			remaining: -1,
		};
	}
}

/**
 * Check if an action is allowed and increment the counter if so
 * Returns false if quota would be exceeded
 */
export async function checkAndIncrementQuota(
	identifier: QuotaIdentifier,
	quotaType: QuotaType,
	planId = "free",
	incrementBy = 1,
): Promise<QuotaCheckResult> {
	try {
		const limits = getPlanLimits(planId);
		const limit = limits[quotaType];

		// If unlimited, always allow but still track usage
		if (isUnlimited(limit)) {
			await incrementQuotaUsage(identifier, quotaType, incrementBy, -1);
			return {
				allowed: true,
				used: 0,
				limit: -1,
				remaining: -1,
			};
		}

		// Use a transaction to atomically check and increment
		const result = await db.$transaction(async (tx) => {
			const where =
				identifier.type === "organization"
					? {
							organizationId_quotaType: {
								organizationId: identifier.organizationId,
								quotaType,
							},
						}
					: {
							userId_quotaType: {
								userId: identifier.userId,
								quotaType,
							},
						};

			const data =
				identifier.type === "organization"
					? {
							id: createId(),
							organizationId: identifier.organizationId,
							quotaType,
							limit,
							used: 0,
							updatedAt: new Date(),
						}
					: {
							id: createId(),
							userId: identifier.userId,
							quotaType,
							limit,
							used: 0,
							updatedAt: new Date(),
						};

			// Get or create the quota record
			let quota = await tx.usageQuota.upsert({
				where,
				create: data,
				update: {},
			});

			// Check if incrementing would exceed the limit
			if (quota.used + incrementBy > limit) {
				const result: QuotaCheckResult = {
					allowed: false,
					used: quota.used,
					limit,
					remaining: Math.max(0, limit - quota.used),
				};
				if (quota.resetAt) {
					result.resetAt = quota.resetAt;
				}
				return result;
			}

			// Increment the counter
			quota = await tx.usageQuota.update({
				where,
				data: {
					used: { increment: incrementBy },
				},
			});

			const result: QuotaCheckResult = {
				allowed: true,
				used: quota.used,
				limit,
				remaining: Math.max(0, limit - quota.used),
			};
			if (quota.resetAt) {
				result.resetAt = quota.resetAt;
			}
			return result;
		});

		return result;
	} catch (error) {
		logger.error("Failed to check and increment quota", {
			error,
			identifier,
			quotaType,
		});
		// Fail open
		return {
			allowed: true,
			used: 0,
			limit: -1,
			remaining: -1,
		};
	}
}

/**
 * Increment quota usage without checking limits
 * Use this for tracking usage of unlimited quotas or when you've already checked
 */
export async function incrementQuotaUsage(
	identifier: QuotaIdentifier,
	quotaType: QuotaType,
	incrementBy = 1,
	limit = -1,
): Promise<void> {
	try {
		const where =
			identifier.type === "organization"
				? {
						organizationId_quotaType: {
							organizationId: identifier.organizationId,
							quotaType,
						},
					}
				: {
						userId_quotaType: {
							userId: identifier.userId,
							quotaType,
						},
					};

		const data =
			identifier.type === "organization"
				? {
						id: createId(),
						organizationId: identifier.organizationId,
						quotaType,
						limit,
						used: incrementBy,
						updatedAt: new Date(),
					}
				: {
						id: createId(),
						userId: identifier.userId,
						quotaType,
						limit,
						used: incrementBy,
						updatedAt: new Date(),
					};

		await db.usageQuota.upsert({
			where,
			create: data,
			update: {
				used: { increment: incrementBy },
			},
		});
	} catch (error) {
		logger.error("Failed to increment quota usage", {
			error,
			identifier,
			quotaType,
		});
	}
}

/**
 * Decrement quota usage (e.g., when a member is removed)
 */
export async function decrementQuotaUsage(
	identifier: QuotaIdentifier,
	quotaType: QuotaType,
	decrementBy = 1,
): Promise<void> {
	try {
		const where =
			identifier.type === "organization"
				? {
						organizationId_quotaType: {
							organizationId: identifier.organizationId,
							quotaType,
						},
					}
				: {
						userId_quotaType: {
							userId: identifier.userId,
							quotaType,
						},
					};

		// Only decrement if record exists and won't go negative
		const quota = await db.usageQuota.findFirst({
			where:
				identifier.type === "organization"
					? { organizationId: identifier.organizationId, quotaType }
					: { userId: identifier.userId, quotaType },
		});

		if (quota && quota.used >= decrementBy) {
			await db.usageQuota.update({
				where,
				data: {
					used: { decrement: decrementBy },
				},
			});
		}
	} catch (error) {
		logger.error("Failed to decrement quota usage", {
			error,
			identifier,
			quotaType,
		});
	}
}

/**
 * Get current quota usage for all quota types
 */
export async function getQuotaUsage(
	identifier: QuotaIdentifier,
): Promise<Record<QuotaType, QuotaCheckResult>> {
	try {
		const quotas = await db.usageQuota.findMany({
			where:
				identifier.type === "organization"
					? { organizationId: identifier.organizationId }
					: { userId: identifier.userId },
		});

		const result: Record<string, QuotaCheckResult> = {};

		for (const quota of quotas) {
			const quotaResult: QuotaCheckResult = {
				allowed: quota.limit === -1 || quota.used < quota.limit,
				used: quota.used,
				limit: quota.limit,
				remaining:
					quota.limit === -1
						? -1
						: Math.max(0, quota.limit - quota.used),
			};
			if (quota.resetAt) {
				quotaResult.resetAt = quota.resetAt;
			}
			result[quota.quotaType] = quotaResult;
		}

		return result as Record<QuotaType, QuotaCheckResult>;
	} catch (error) {
		logger.error("Failed to get quota usage", { error, identifier });
		return {} as Record<QuotaType, QuotaCheckResult>;
	}
}

/**
 * Reset quota usage for a specific quota type
 */
export async function resetQuota(
	identifier: QuotaIdentifier,
	quotaType: QuotaType,
): Promise<void> {
	try {
		await db.usageQuota.updateMany({
			where:
				identifier.type === "organization"
					? { organizationId: identifier.organizationId, quotaType }
					: { userId: identifier.userId, quotaType },
			data: {
				used: 0,
				resetAt: null,
			},
		});
	} catch (error) {
		logger.error("Failed to reset quota", { error, identifier, quotaType });
	}
}

/**
 * Update quota limits when plan changes
 */
export async function updateQuotaLimits(
	identifier: QuotaIdentifier,
	planId: string,
): Promise<void> {
	try {
		const limits = getPlanLimits(planId);

		for (const quotaType of Object.keys(limits) as QuotaType[]) {
			const limit = limits[quotaType];
			const where =
				identifier.type === "organization"
					? {
							organizationId_quotaType: {
								organizationId: identifier.organizationId,
								quotaType,
							},
						}
					: {
							userId_quotaType: {
								userId: identifier.userId,
								quotaType,
							},
						};

			const data =
				identifier.type === "organization"
					? {
							id: createId(),
							organizationId: identifier.organizationId,
							quotaType,
							limit,
							used: 0,
							updatedAt: new Date(),
						}
					: {
							id: createId(),
							userId: identifier.userId,
							quotaType,
							limit,
							used: 0,
							updatedAt: new Date(),
						};

			await db.usageQuota.upsert({
				where,
				create: data,
				update: { limit },
			});
		}
	} catch (error) {
		logger.error("Failed to update quota limits", {
			error,
			identifier,
			planId,
		});
	}
}
