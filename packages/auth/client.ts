import { passkeyClient } from "@better-auth/passkey/client";
import {
	adminClient,
	inferAdditionalFields,
	magicLinkClient,
	organizationClient,
	twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { auth } from ".";
import { ac, admin, member, owner } from "./permissions";

/**
 * Create the auth client with all plugins.
 *
 * Type inference comes directly from better-auth's plugin system:
 * - inferAdditionalFields<typeof auth>() provides type inference for additional
 *   user fields defined in auth.ts (e.g., onboardingComplete, locale)
 * - organizationClient, adminClient, etc. provide their own type inference
 *
 * We export the client directly without manual type overrides to ensure
 * types match better-auth's actual API.
 */
export const authClient = createAuthClient({
	plugins: [
		inferAdditionalFields<typeof auth>(),
		magicLinkClient(),
		organizationClient({
			ac,
			roles: {
				owner,
				admin,
				member,
			},
			dynamicAccessControl: {
				enabled: true,
			},
		}),
		adminClient(),
		passkeyClient(),
		twoFactorClient(),
	],
});

export type AuthClientErrorCodes = typeof authClient.$ERROR_CODES & {
	INVALID_INVITATION: string;
};
