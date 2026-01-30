import { createId } from "@paralleldrive/cuid2";
import { config } from "@repo/config";
import { db, type Prisma } from "@repo/database";
import { logger } from "@repo/logs";
import type { LoginAttemptInfo } from "./types";

/**
 * Record a login attempt (success or failure)
 */
export async function recordLoginAttempt(info: LoginAttemptInfo) {
	if (!config.security.failedLogin.enabled) {
		return;
	}

	try {
		const data: Prisma.LoginAttemptUncheckedCreateInput = {
			id: createId(),
			email: info.email,
			userId: info.userId ?? null,
			ipAddress: info.ipAddress ?? null,
			userAgent: info.userAgent ?? null,
			success: info.success,
			failureReason: info.failureReason ?? null,
		};
		await db.loginAttempt.create({ data });

		logger.debug("Login attempt recorded", {
			email: info.email,
			success: info.success,
		});
	} catch (error) {
		logger.error("Failed to record login attempt", { error });
	}
}

/**
 * Get recent failed login attempts for an email
 */
export async function getRecentFailedAttempts(
	email: string,
	windowMinutes = 15,
): Promise<number> {
	const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

	const count = await db.loginAttempt.count({
		where: {
			email,
			success: false,
			createdAt: {
				gte: windowStart,
			},
		},
	});

	return count;
}

/**
 * Calculate progressive delay based on failed attempts
 * Uses exponential backoff: baseDelay * multiplier^(attempts-1)
 */
export function calculateProgressiveDelay(failedAttempts: number): number {
	if (failedAttempts <= 0) {
		return 0;
	}

	const { baseDelayMs, maxDelayMs, delayMultiplier } =
		config.security.failedLogin;

	const delay = baseDelayMs * delayMultiplier ** (failedAttempts - 1);
	return Math.min(delay, maxDelayMs);
}

/**
 * Apply progressive delay before login
 * Returns the delay in milliseconds that was applied
 */
export async function applyProgressiveDelay(email: string): Promise<number> {
	if (!config.security.failedLogin.enabled) {
		return 0;
	}

	const failedAttempts = await getRecentFailedAttempts(email);

	if (failedAttempts === 0) {
		return 0;
	}

	const delay = calculateProgressiveDelay(failedAttempts);

	if (delay > 0) {
		logger.debug("Applying progressive delay", {
			email,
			failedAttempts,
			delayMs: delay,
		});
		await new Promise((resolve) => setTimeout(resolve, delay));
	}

	return delay;
}

/**
 * Clear failed login attempts for a user after successful login
 */
export async function clearFailedAttempts(email: string): Promise<void> {
	// We don't actually delete the records (for audit purposes)
	// The sliding window approach naturally expires old attempts
	logger.debug("Successful login, failed attempts will naturally expire", {
		email,
	});
}

/**
 * Get login history for a user
 */
export async function getLoginHistory(
	userId: string,
	limit = 20,
): Promise<
	{
		id: string;
		email: string;
		ipAddress: string | null;
		userAgent: string | null;
		success: boolean;
		failureReason: string | null;
		createdAt: Date;
	}[]
> {
	return db.loginAttempt.findMany({
		where: { userId },
		orderBy: { createdAt: "desc" },
		take: limit,
		select: {
			id: true,
			email: true,
			ipAddress: true,
			userAgent: true,
			success: true,
			failureReason: true,
			createdAt: true,
		},
	});
}
