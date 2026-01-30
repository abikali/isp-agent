import type { PlanLimits, QuotaType } from "@repo/config";

export type { PlanLimits, QuotaType };

/**
 * Quota check result
 */
export interface QuotaCheckResult {
	/** Whether the action is allowed within quota */
	allowed: boolean;
	/** Current usage */
	used: number;
	/** Limit for this quota type (-1 for unlimited) */
	limit: number;
	/** Remaining quota (-1 for unlimited) */
	remaining: number;
	/** When the quota resets (if time-based) */
	resetAt?: Date;
}

/**
 * Quota identifier - either organization or user based
 */
export type QuotaIdentifier =
	| { type: "organization"; organizationId: string }
	| { type: "user"; userId: string };

/**
 * Plan info for quota calculation
 */
export interface PlanInfo {
	planId: string;
	limits: PlanLimits;
}
