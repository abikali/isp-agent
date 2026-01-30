import { auth, authApi, type Session } from "@repo/auth";
import { getUserById } from "@repo/database";
import { logger } from "@repo/logs";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

/**
 * Get the current session from the request headers.
 * Use this in beforeLoad hooks for authentication checks.
 *
 * Validates that the user still exists in the database to handle stale sessions
 * (e.g., after a database reset where sessions remain in Redis but users are deleted).
 */
export const getSessionFn = createServerFn({ method: "GET" }).handler(
	async (): Promise<Session | null> => {
		const request = getRequest();
		try {
			const session = await auth.api.getSession({
				headers: request.headers,
			});

			if (!session?.user) {
				return null;
			}

			// Verify user still exists in database (handles stale sessions after DB reset)
			const userExists = await getUserById(session.user.id);
			if (!userExists) {
				return null;
			}

			return session as Session | null;
		} catch {
			return null;
		}
	},
);

/**
 * Get the list of organizations for the current user
 */
export const getOrganizationListFn = createServerFn({ method: "GET" }).handler(
	async () => {
		try {
			const request = getRequest();
			const organizationList = await authApi.listOrganizations({
				headers: request.headers,
			});
			return organizationList ?? [];
		} catch (error) {
			logger.error("Failed to get organization list", { error });
			return [];
		}
	},
);

/**
 * Get the user's connected accounts (OAuth providers)
 */
export const getUserAccountsFn = createServerFn({ method: "GET" }).handler(
	async () => {
		try {
			const request = getRequest();
			const userAccounts = await auth.api.listUserAccounts({
				headers: request.headers,
			});
			return userAccounts;
		} catch (error) {
			logger.error("Failed to get user accounts", { error });
			return [];
		}
	},
);
