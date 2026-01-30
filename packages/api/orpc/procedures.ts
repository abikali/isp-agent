import { ORPCError, os } from "@orpc/server";
import { auth, type User } from "@repo/auth";
import { getUserById } from "@repo/database";
import {
	apiRateLimitMiddleware,
	authRateLimitMiddleware,
} from "./middleware/rate-limit-middleware";

export const publicProcedure = os.$context<{
	headers: Headers;
}>();

/**
 * Public procedure with API rate limiting
 */
export const rateLimitedProcedure = publicProcedure.use(apiRateLimitMiddleware);

/**
 * Protected procedure - requires authentication
 * Verifies that both the session exists AND the user still exists in the database.
 * This prevents stale sessions from accessing protected resources after a database reset.
 */
export const protectedProcedure = publicProcedure.use(
	async ({ context, next }) => {
		const session = await auth.api.getSession({
			headers: context.headers,
		});

		if (!session) {
			throw new ORPCError("UNAUTHORIZED");
		}

		// Verify user still exists in database (handles stale sessions after DB reset)
		const userExists = await getUserById(session.user.id);
		if (!userExists) {
			throw new ORPCError("UNAUTHORIZED", {
				message: "Session expired",
			});
		}

		return await next({
			context: {
				headers: context.headers,
				session: session.session,
				user: session.user,
			},
		});
	},
);

/**
 * Protected procedure with API rate limiting
 */
export const rateLimitedProtectedProcedure = protectedProcedure.use(
	apiRateLimitMiddleware,
);

/**
 * Auth-specific procedure with stricter rate limiting
 * Use for login, signup, password reset endpoints
 */
export const authProcedure = publicProcedure.use(authRateLimitMiddleware);

/**
 * Admin procedure - requires admin role
 * User type includes role from admin plugin (see @repo/auth User interface)
 */
export const adminProcedure = protectedProcedure.use(
	async ({ context, next }) => {
		const user = context.user as User;
		if (user.role !== "admin") {
			throw new ORPCError("FORBIDDEN");
		}

		return await next();
	},
);
