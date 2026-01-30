import { ORPCError, os } from "@orpc/server";
import type { QuotaType } from "@repo/config";
import {
	checkAndIncrementQuota,
	checkQuota,
	type QuotaCheckResult,
	type QuotaIdentifier,
} from "@repo/quotas";

/**
 * Create a quota checking middleware for specific quota types.
 * This checks if the operation is allowed without incrementing.
 * Use this for read operations or when you want to check before performing an action.
 */
export function createQuotaCheckMiddleware(quotaType: QuotaType) {
	return os
		.$context<{
			organizationId?: string;
			user?: { id: string };
			planId?: string;
		}>()
		.middleware(async ({ context, next }) => {
			// Build identifier - organization or user based
			const identifier: QuotaIdentifier | null = context.organizationId
				? {
						type: "organization",
						organizationId: context.organizationId,
					}
				: context.user
					? { type: "user", userId: context.user.id }
					: null;

			if (!identifier) {
				// No identifier means no quota check needed (public endpoint)
				return await next({
					context: {
						quota: null as QuotaCheckResult | null,
					},
				});
			}

			const planId = context.planId ?? "free";
			const result = await checkQuota(identifier, quotaType, planId);

			if (!result.allowed) {
				throw new ORPCError("FORBIDDEN", {
					message: `Quota exceeded for ${quotaType}. Upgrade your plan for higher limits.`,
					data: {
						quotaType,
						used: result.used,
						limit: result.limit,
						remaining: result.remaining,
						resetAt: result.resetAt,
					},
				});
			}

			return await next({
				context: {
					quota: result,
				},
			});
		});
}

/**
 * Create a quota enforcement middleware that checks AND increments.
 * Use this for operations that consume quota (e.g., creating a member, project).
 */
export function createQuotaEnforcementMiddleware(
	quotaType: QuotaType,
	incrementBy = 1,
) {
	return os
		.$context<{
			organizationId?: string;
			user?: { id: string };
			planId?: string;
		}>()
		.middleware(async ({ context, next }) => {
			const identifier: QuotaIdentifier | null = context.organizationId
				? {
						type: "organization",
						organizationId: context.organizationId,
					}
				: context.user
					? { type: "user", userId: context.user.id }
					: null;

			if (!identifier) {
				return await next({
					context: {
						quota: null as QuotaCheckResult | null,
					},
				});
			}

			const planId = context.planId ?? "free";
			const result = await checkAndIncrementQuota(
				identifier,
				quotaType,
				planId,
				incrementBy,
			);

			if (!result.allowed) {
				throw new ORPCError("FORBIDDEN", {
					message: `Quota exceeded for ${quotaType}. Upgrade your plan for higher limits.`,
					data: {
						quotaType,
						used: result.used,
						limit: result.limit,
						remaining: result.remaining,
						resetAt: result.resetAt,
					},
				});
			}

			return await next({
				context: {
					quota: result,
				},
			});
		});
}

/**
 * Pre-configured quota check middlewares (read-only, no increment)
 */
export const membersQuotaCheck = createQuotaCheckMiddleware("members");
export const projectsQuotaCheck = createQuotaCheckMiddleware("projects");
export const apiCallsQuotaCheck = createQuotaCheckMiddleware("apiCalls");
export const storageQuotaCheck = createQuotaCheckMiddleware("storage");

/**
 * Pre-configured quota enforcement middlewares (check + increment)
 */
export const membersQuotaEnforce = createQuotaEnforcementMiddleware("members");
export const projectsQuotaEnforce =
	createQuotaEnforcementMiddleware("projects");
export const apiCallsQuotaEnforce =
	createQuotaEnforcementMiddleware("apiCalls");

/**
 * Storage quota enforcement with configurable size
 * @param sizeMB Size in megabytes to increment by
 */
export function storageQuotaEnforce(sizeMB: number) {
	return createQuotaEnforcementMiddleware("storage", sizeMB);
}
