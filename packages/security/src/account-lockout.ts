import { createId } from "@paralleldrive/cuid2";
import { config } from "@repo/config";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { sendEmail } from "@repo/mail";
import type { LockoutInfo, LockoutReason } from "./types";

/**
 * Check if an account is currently locked
 */
export async function isAccountLocked(userId: string): Promise<{
	locked: boolean;
	lockout?: LockoutInfo;
}> {
	if (!config.security.accountLockout.enabled) {
		return { locked: false };
	}

	const lockout = await db.accountLockout.findUnique({
		where: { userId },
	});

	if (!lockout) {
		return { locked: false };
	}

	// Check if lockout has been manually unlocked
	if (lockout.unlockedAt) {
		return { locked: false };
	}

	// Check if lockout has expired
	if (lockout.unlocksAt <= new Date()) {
		// Auto-unlock expired lockout
		await db.accountLockout.update({
			where: { userId },
			data: {
				unlockedAt: new Date(),
				unlockedBy: "system_auto",
			},
		});
		return { locked: false };
	}

	const lockoutInfo: LockoutInfo = {
		userId: lockout.userId,
		lockedAt: lockout.lockedAt,
		unlocksAt: lockout.unlocksAt,
		failedAttempts: lockout.failedAttempts,
	};
	if (lockout.reason) {
		lockoutInfo.reason = lockout.reason;
	}

	return {
		locked: true,
		lockout: lockoutInfo,
	};
}

/**
 * Lock an account
 */
export async function lockAccount(
	userId: string,
	reason: LockoutReason = "too_many_failed_attempts",
	failedAttempts = 0,
): Promise<LockoutInfo> {
	const { lockoutDurationMinutes } = config.security.accountLockout;
	const unlocksAt = new Date(Date.now() + lockoutDurationMinutes * 60 * 1000);

	const lockout = await db.accountLockout.upsert({
		where: { userId },
		create: {
			id: createId(),
			userId,
			lockedAt: new Date(),
			unlocksAt,
			failedAttempts,
			reason,
		},
		update: {
			lockedAt: new Date(),
			unlocksAt,
			failedAttempts,
			reason,
			unlockedAt: null,
			unlockedBy: null,
		},
	});

	logger.warn("Account locked", {
		userId,
		reason,
		unlocksAt,
		failedAttempts,
	});

	// Send notification if enabled
	if (config.security.accountLockout.notifyOnLockout) {
		await sendLockoutNotification(userId, unlocksAt, reason);
	}

	const lockoutResult: LockoutInfo = {
		userId: lockout.userId,
		lockedAt: lockout.lockedAt,
		unlocksAt: lockout.unlocksAt,
		failedAttempts: lockout.failedAttempts,
	};
	if (lockout.reason) {
		lockoutResult.reason = lockout.reason;
	}
	return lockoutResult;
}

/**
 * Manually unlock an account (admin action)
 */
export async function unlockAccount(
	userId: string,
	unlockedByUserId: string,
): Promise<void> {
	await db.accountLockout.update({
		where: { userId },
		data: {
			unlockedAt: new Date(),
			unlockedBy: unlockedByUserId,
		},
	});

	logger.info("Account manually unlocked", {
		userId,
		unlockedBy: unlockedByUserId,
	});
}

/**
 * Check if account should be locked based on failed attempts
 */
export async function shouldLockAccount(email: string): Promise<boolean> {
	if (!config.security.accountLockout.enabled) {
		return false;
	}

	const { maxFailedAttempts } = config.security.accountLockout;

	// Count recent failed attempts
	const windowStart = new Date(Date.now() - 15 * 60 * 1000); // 15 minute window
	const failedCount = await db.loginAttempt.count({
		where: {
			email,
			success: false,
			createdAt: {
				gte: windowStart,
			},
		},
	});

	return failedCount >= maxFailedAttempts;
}

/**
 * Send lockout notification email
 */
async function sendLockoutNotification(
	userId: string,
	unlocksAt: Date,
	reason: string,
): Promise<void> {
	try {
		const user = await db.user.findUnique({
			where: { id: userId },
			select: { email: true, name: true },
		});

		if (!user) {
			return;
		}

		await sendEmail({
			to: user.email,
			subject: "Your account has been temporarily locked",
			html: `
				<h2>Account Security Alert</h2>
				<p>Hi ${user.name || "there"},</p>
				<p>Your account has been temporarily locked due to: <strong>${formatReason(reason)}</strong></p>
				<p>Your account will be automatically unlocked at: <strong>${unlocksAt.toLocaleString()}</strong></p>
				<p>If you did not attempt to log in, please contact support immediately.</p>
				<p>For your security, we recommend:</p>
				<ul>
					<li>Using a strong, unique password</li>
					<li>Enabling two-factor authentication</li>
					<li>Reviewing your recent account activity</li>
				</ul>
			`,
		});
	} catch (error) {
		logger.error("Failed to send lockout notification", { error, userId });
	}
}

/**
 * Format lockout reason for display
 */
function formatReason(reason: string): string {
	const reasonMap: Record<string, string> = {
		too_many_failed_attempts: "too many failed login attempts",
		admin_action: "administrative action",
		suspicious_activity: "suspicious activity detected",
	};
	return reasonMap[reason] || reason;
}

/**
 * Get all currently locked accounts (admin view)
 */
export async function getLockedAccounts(): Promise<
	{
		userId: string;
		email: string;
		name: string | null;
		lockedAt: Date;
		unlocksAt: Date;
		reason: string | null;
		failedAttempts: number;
	}[]
> {
	const lockouts = await db.accountLockout.findMany({
		where: {
			unlockedAt: null,
			unlocksAt: {
				gt: new Date(),
			},
		},
		include: {
			user: {
				select: {
					email: true,
					name: true,
				},
			},
		},
	});

	return lockouts.map((l) => ({
		userId: l.userId,
		email: l.user.email,
		name: l.user.name,
		lockedAt: l.lockedAt,
		unlocksAt: l.unlocksAt,
		reason: l.reason,
		failedAttempts: l.failedAttempts,
	}));
}
