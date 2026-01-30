export interface DeviceInfo {
	userAgent: string;
	ipAddress?: string;
}

export interface LoginAttemptInfo {
	email: string;
	userId?: string;
	ipAddress?: string;
	userAgent?: string;
	success: boolean;
	failureReason?: string;
}

export interface LockoutInfo {
	userId: string;
	lockedAt: Date;
	unlocksAt: Date;
	failedAttempts: number;
	reason?: string;
}

export type LockoutReason =
	| "too_many_failed_attempts"
	| "admin_action"
	| "suspicious_activity";

export type LoginFailureReason =
	| "invalid_password"
	| "user_not_found"
	| "account_locked"
	| "account_disabled"
	| "email_not_verified"
	| "2fa_required"
	| "2fa_failed";
