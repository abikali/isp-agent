import { ORPCError, os } from "@orpc/server";
import {
	checkRateLimit,
	createRateLimitHeaders,
	type RateLimitCategory,
	type RateLimitIdentifier,
} from "@repo/rate-limit";

/**
 * Extract IP address from request headers
 *
 * NOTE: This function trusts the first IP in x-forwarded-for.
 * Most hosting providers add the real client IP as the first value.
 * If you change hosting providers, verify their proxy behavior:
 * - Cloudflare: Use CF-Connecting-IP header instead
 * - AWS ALB: First IP is client IP (trusted)
 */
function getIpFromHeaders(headers: Headers): string {
	// Client IP is typically the first value in x-forwarded-for
	return (
		headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		headers.get("x-real-ip") ||
		"unknown"
	);
}

/**
 * Rate limit middleware for API endpoints
 * Applies rate limiting based on user ID (if authenticated) or IP address
 */
export function createRateLimitMiddleware(category: RateLimitCategory) {
	return os
		.$context<{
			headers: Headers;
			user?: { id: string };
		}>()
		.middleware(async ({ context, next }) => {
			// Build identifier - prefer user ID over IP for authenticated users
			const identifier: RateLimitIdentifier = context.user
				? { type: "user", userId: context.user.id }
				: { type: "ip", ip: getIpFromHeaders(context.headers) };

			const result = await checkRateLimit(category, identifier);

			if (!result.allowed) {
				throw new ORPCError("TOO_MANY_REQUESTS", {
					message: `Rate limit exceeded. Please try again in ${result.retryAfter} seconds.`,
					data: {
						retryAfter: result.retryAfter,
						resetAt: result.resetAt,
					},
				});
			}

			// Continue with rate limit info in context
			return await next({
				context: {
					rateLimit: {
						remaining: result.remaining,
						limit: result.limit,
						resetAt: result.resetAt,
					},
				},
			});
		});
}

/**
 * Pre-configured rate limit middlewares for common use cases
 */
export const apiRateLimitMiddleware = createRateLimitMiddleware("api");
export const authRateLimitMiddleware = createRateLimitMiddleware("auth");
export const uploadRateLimitMiddleware = createRateLimitMiddleware("upload");
export const webhookRateLimitMiddleware = createRateLimitMiddleware("webhook");

/**
 * Helper to create rate limit response headers
 * Use this in your API handlers if you need to include rate limit headers
 */
export { createRateLimitHeaders };
