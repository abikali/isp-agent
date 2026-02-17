import { passkey } from "@better-auth/passkey";
import { createId } from "@paralleldrive/cuid2";
import { config } from "@repo/config";
import {
	db,
	getInvitationById,
	getPurchasesByOrganizationId,
	getPurchasesByUserId,
	getUserByEmail,
} from "@repo/database";
import type { Locale } from "@repo/i18n";
import { logger } from "@repo/logs";
import { sendEmail } from "@repo/mail";
import {
	notifyInvitationAccepted,
	notifyMemberJoined,
} from "@repo/notifications";
import { cancelSubscription } from "@repo/payments";
import {
	applyProgressiveDelay,
	handleDeviceLogin,
	isAccountLocked,
	recordLoginAttempt,
} from "@repo/security";
import { getBaseUrl } from "@repo/utils";
import { type BetterAuthPlugin, betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import {
	admin,
	createAuthMiddleware,
	magicLink,
	openAPI,
	organization,
	twoFactor,
	username,
} from "better-auth/plugins";
import { parse as parseCookies } from "cookie";
import IORedis from "ioredis";
import {
	authAudit,
	getRequestContext,
	memberAudit,
	organizationAudit,
} from "./lib/audit";
import { updateSeatsInOrganizationSubscription } from "./lib/organization";
import { ac, admin as adminRole, member, owner } from "./permissions";
import { invitationOnlyPlugin } from "./plugins/invitation-only";

const getLocaleFromRequest = (
	ctx?: Request | { request?: Request } | unknown,
) => {
	// Support both ctx object (new better-auth 1.4+) and Request (legacy)
	const request =
		ctx instanceof Request
			? ctx
			: (ctx as { request?: Request } | undefined)?.request;
	const cookies = parseCookies(request?.headers.get("cookie") ?? "");
	return (
		(cookies[config.i18n.localeCookieName] as Locale) ??
		config.i18n.defaultLocale
	);
};

const appUrl = getBaseUrl();

// Redis client for Better Auth secondary storage (lazy initialization)
let redisClient: IORedis | null = null;
function getRedis(): IORedis {
	if (!redisClient) {
		const redisUrl = config.jobs.redis.url;
		if (!redisUrl) {
			throw new Error(
				"Redis URL not configured. Set REDIS_URL environment variable.",
			);
		}
		redisClient = new IORedis(redisUrl, {
			maxRetriesPerRequest: null,
			enableReadyCheck: false,
		});
	}
	return redisClient;
}

// Include both localhost and 127.0.0.1 for local dev/testing
const trustedOrigins = [appUrl];
if (appUrl.includes("localhost")) {
	trustedOrigins.push(appUrl.replace("localhost", "127.0.0.1"));
}
// When using a tunnel, also trust the local dev origins
if (!appUrl.includes("localhost")) {
	trustedOrigins.push("http://localhost:5050");
	trustedOrigins.push("http://127.0.0.1:5050");
	trustedOrigins.push("http://localhost:3030");
	trustedOrigins.push("http://127.0.0.1:3030");
}

export const auth = betterAuth({
	baseURL: appUrl,
	trustedOrigins,
	appName: config.appName,
	database: prismaAdapter(db, {
		provider: "postgresql",
	}),
	advanced: {
		database: {
			generateId: () => createId(),
		},
	},
	secondaryStorage: {
		get: async (key) => {
			const value = await getRedis().get(key);
			return value ?? null;
		},
		set: async (key, value, ttl) => {
			if (ttl) {
				await getRedis().setex(key, ttl, value);
			} else {
				await getRedis().set(key, value);
			}
		},
		delete: async (key) => {
			await getRedis().del(key);
		},
	},
	rateLimit: {
		enabled: true,
		window: 60,
		max: 100,
		storage: "secondary-storage",
		customRules: {
			"/forget-password": {
				window: 300,
				max: 3,
			},
			"/magic-link": {
				window: 300,
				max: 3,
			},
			"/send-verification-email": {
				window: 300,
				max: 3,
			},
			"/organization/invite-member": {
				window: 60,
				max: 10,
			},
			// OAuth rate limiting
			"/sign-in/social": {
				window: 60,
				max: 10, // 10 OAuth attempts per minute
			},
			"/callback/*": {
				window: 60,
				max: 15, // 15 callbacks per minute (slightly higher for retries)
			},
		},
	},
	session: {
		expiresIn: config.auth.sessionCookieMaxAge,
		freshAge: 0,
	},
	account: {
		accountLinking: {
			enabled: true,
			trustedProviders: ["google", "github"],
		},
	},
	hooks: {
		after: createAuthMiddleware(async (ctx) => {
			const requestContext = getRequestContext(ctx.request);

			// Helper to get userId - for sign-in/sign-up/callback, use newSession; otherwise use session
			const getUserId = () => {
				// For sign-in, sign-up, and social callbacks, the session is created as part of the request
				// so we need to use newSession instead of session
				if (
					ctx.path.startsWith("/sign-in") ||
					ctx.path.startsWith("/sign-up") ||
					ctx.path.startsWith("/callback") ||
					ctx.path.startsWith("/magic-link/verify")
				) {
					return ctx.context.newSession?.user?.id;
				}
				return ctx.context.session?.session.userId;
			};

			// Audit logging for various auth events
			// Better Auth uses paths like /sign-in/email, /sign-up/email, etc.
			if (
				ctx.path === "/sign-in/email" ||
				ctx.path === "/sign-in/username"
			) {
				const userId = getUserId();
				const email = ctx.body?.email || ctx.body?.username;

				if (userId) {
					// Record successful login
					const loginAttemptInfo: Parameters<
						typeof recordLoginAttempt
					>[0] = {
						email: email || "",
						userId,
						success: true,
					};
					if (requestContext.ipAddress) {
						loginAttemptInfo.ipAddress = requestContext.ipAddress;
					}
					if (requestContext.userAgent) {
						loginAttemptInfo.userAgent = requestContext.userAgent;
					}
					await recordLoginAttempt(loginAttemptInfo);

					// Handle device tracking
					if (requestContext.userAgent) {
						const deviceInfo: Parameters<
							typeof handleDeviceLogin
						>[1] = {
							userAgent: requestContext.userAgent,
						};
						if (requestContext.ipAddress) {
							deviceInfo.ipAddress = requestContext.ipAddress;
						}
						await handleDeviceLogin(userId, deviceInfo);
					}

					authAudit.login(userId, requestContext, {
						provider: "email",
					});
				}
			} else if (ctx.path === "/magic-link/verify") {
				const userId = getUserId();
				if (userId) {
					authAudit.login(userId, requestContext, {
						provider: "magic-link",
					});
				}
			} else if (ctx.path === "/sign-out") {
				const userId = getUserId();
				if (userId) {
					authAudit.logout(userId, requestContext);
				}
			} else if (ctx.path === "/sign-up/email") {
				const userId = getUserId();
				if (userId) {
					authAudit.signup(userId, requestContext, {
						provider: "email",
					});
				}
			} else if (ctx.path.startsWith("/reset-password")) {
				const userId = getUserId();
				if (userId) {
					authAudit.passwordReset(userId, requestContext);
				}
			} else if (ctx.path.startsWith("/two-factor/enable")) {
				const userId = getUserId();
				if (userId) {
					authAudit.twoFactorEnabled(userId, requestContext);
				}
			} else if (ctx.path.startsWith("/two-factor/disable")) {
				const userId = getUserId();
				if (userId) {
					authAudit.twoFactorDisabled(userId, requestContext);
				}
			} else if (ctx.path.startsWith("/passkey/add")) {
				const userId = getUserId();
				if (userId) {
					authAudit.passkeyAdded(userId, requestContext);
				}
			} else if (ctx.path.startsWith("/organization/create")) {
				const userId = getUserId();
				const organizationId = ctx.body?.id;
				if (userId && organizationId) {
					organizationAudit.created(
						organizationId,
						userId,
						requestContext,
						{
							name: ctx.body?.name,
							slug: ctx.body?.slug,
						},
					);
				}
			} else if (ctx.path.startsWith("/organization/accept-invitation")) {
				const { invitationId } = ctx.body;
				const userId = getUserId();

				if (!invitationId) {
					return;
				}

				const invitation = await getInvitationById(invitationId);

				if (!invitation) {
					return;
				}

				// Log member joined
				if (userId) {
					memberAudit.joined(
						invitation.organizationId,
						userId,
						requestContext,
						{
							role: invitation.role || "member", // Default to member if role is somehow null
							invitationId,
						},
					);

					// Send team notifications (fire-and-forget)
					try {
						// Fetch user and organization details for notifications
						const [newMember, org] = await Promise.all([
							db.user.findUnique({
								where: { id: userId },
								select: { name: true },
							}),
							db.organization.findUnique({
								where: { id: invitation.organizationId },
								select: { name: true, slug: true },
							}),
						]);

						if (newMember && org) {
							// Notify other organization members about new member
							notifyMemberJoined({
								organizationId: invitation.organizationId,
								organizationName: org.name ?? "Organization",
								newMemberName: newMember.name ?? "New Member",
								newMemberUserId: userId,
								organizationSlug: org.slug ?? "",
							}).catch((error: unknown) => {
								logger.error(
									"Failed to send member joined notification",
									{
										organizationId:
											invitation.organizationId,
										userId,
										error,
									},
								);
							});

							// Notify the inviter that their invitation was accepted
							if (invitation.inviterId) {
								notifyInvitationAccepted({
									inviterId: invitation.inviterId,
									newMemberName: newMember.name ?? "Someone",
									organizationName:
										org.name ?? "Organization",
									organizationSlug: org.slug ?? "",
								}).catch((error: unknown) => {
									logger.error(
										"Failed to send invitation accepted notification",
										{
											inviterId: invitation.inviterId,
											userId,
											error,
										},
									);
								});
							}
						}
					} catch (error) {
						logger.error(
							"Failed to fetch data for team notifications",
							{
								invitationId,
								error,
							},
						);
					}
				}

				await updateSeatsInOrganizationSubscription(
					invitation.organizationId,
				);
			} else if (ctx.path.startsWith("/organization/remove-member")) {
				const { organizationId, memberId } = ctx.body;
				const userId = getUserId();

				if (!organizationId) {
					return;
				}

				// Log member removed
				if (userId) {
					memberAudit.removed(
						organizationId,
						userId,
						requestContext,
						{
							memberId,
						},
					);
				}

				await updateSeatsInOrganizationSubscription(organizationId);
			} else if (ctx.path.startsWith("/organization/invite-member")) {
				const { organizationId, email, role } = ctx.body;
				const userId = getUserId();
				if (userId && organizationId) {
					memberAudit.invited(
						organizationId,
						userId,
						requestContext,
						{
							email,
							role,
						},
					);
				}
			} else if (
				ctx.path.startsWith("/organization/update-member-role")
			) {
				const { organizationId, memberId, role } = ctx.body;
				const userId = getUserId();
				if (userId && organizationId) {
					memberAudit.roleChanged(
						organizationId,
						userId,
						requestContext,
						{
							memberId,
							newRole: role,
						},
					);
				}
			} else if (ctx.path.startsWith("/organization/delete")) {
				const { organizationId } = ctx.body;
				const userId = getUserId();
				if (userId && organizationId) {
					organizationAudit.deleted(
						organizationId,
						userId,
						requestContext,
					);
				}
			} else if (ctx.path.startsWith("/callback")) {
				// Social login callback
				const userId = getUserId();
				if (userId) {
					const provider = ctx.path.split("/callback/")[1];
					const providerOpts: { provider?: string } = {};
					if (provider) {
						providerOpts.provider = provider;
					}
					authAudit.login(userId, requestContext, providerOpts);
				}
			} else if (ctx.path === "/link-social/callback") {
				// Social account linking callback
				const userId = getUserId();
				if (userId) {
					const provider = ctx.body?.providerId;
					authAudit.socialAccountLinked(userId, requestContext, {
						provider,
					});
				}
			} else if (ctx.path.startsWith("/unlink-account")) {
				// Social account unlinking
				const userId = getUserId();
				if (userId) {
					const provider = ctx.body?.providerId;
					authAudit.socialAccountUnlinked(userId, requestContext, {
						provider,
					});
				}
			}
		}),
		before: createAuthMiddleware(async (ctx) => {
			// Security: Check for login attempts (sign-in endpoints)
			if (
				ctx.path === "/sign-in/email" ||
				ctx.path === "/sign-in/username"
			) {
				const email = ctx.body?.email || ctx.body?.username;
				if (email) {
					// Check if user exists and get their ID
					const user = await getUserByEmail(email);

					if (user) {
						// Check if account is locked
						const lockStatus = await isAccountLocked(user.id);
						if (lockStatus.locked) {
							const unlocksAt = lockStatus.lockout?.unlocksAt;
							return {
								error: {
									message: `Account is temporarily locked. Try again after ${unlocksAt?.toLocaleString() || "some time"}.`,
									code: "ACCOUNT_LOCKED",
								},
							};
						}
					}

					// Apply progressive delay based on failed attempts
					await applyProgressiveDelay(email);
				}
			}

			if (
				ctx.path.startsWith("/delete-user") ||
				ctx.path.startsWith("/organization/delete")
			) {
				const userId = ctx.context.session?.session.userId;
				const { organizationId } = ctx.body;

				let purchases: Awaited<
					ReturnType<typeof getPurchasesByOrganizationId>
				> = [];

				if (organizationId) {
					purchases =
						await getPurchasesByOrganizationId(organizationId);
				} else if (userId) {
					purchases = await getPurchasesByUserId(userId);
				}

				const subscriptions = purchases.filter(
					(
						purchase,
					): purchase is typeof purchase & {
						subscriptionId: string;
					} =>
						purchase.type === "SUBSCRIPTION" &&
						purchase.subscriptionId !== null,
				);

				for (const subscription of subscriptions) {
					await cancelSubscription(subscription.subscriptionId);
				}
			}

			// Return undefined to allow the request to proceed
			return;
		}),
	},
	user: {
		additionalFields: {
			onboardingComplete: {
				type: "boolean",
				required: false,
			},
			locale: {
				type: "string",
				required: false,
			},
		},
		deleteUser: {
			enabled: true,
		},
		changeEmail: {
			enabled: true,
			sendChangeEmailVerification: async (
				{ user: { email, name }, url },
				request,
			) => {
				const locale = getLocaleFromRequest(request);
				await sendEmail({
					to: email,
					templateId: "emailVerification",
					context: {
						url,
						name,
					},
					locale,
				});
			},
		},
	},
	emailAndPassword: {
		enabled: true,
		// If signup is disabled, the only way to sign up is via an invitation. So in this case we can auto sign in the user, as the email is already verified by the invitation.
		// If signup is enabled, we can't auto sign in the user, as the email is not verified yet.
		autoSignIn: !config.auth.enableSignup,
		requireEmailVerification: config.auth.enableSignup,
		sendResetPassword: async ({ user, url }, request) => {
			const locale = getLocaleFromRequest(request);
			await sendEmail({
				to: user.email,
				templateId: "forgotPassword",
				context: {
					url,
					name: user.name,
				},
				locale,
			});
		},
	},
	emailVerification: {
		sendOnSignUp: config.auth.enableSignup,
		autoSignInAfterVerification: true,
		sendVerificationEmail: async (
			{ user: { email, name }, url },
			request,
		) => {
			const locale = getLocaleFromRequest(request);
			await sendEmail({
				to: email,
				templateId: "emailVerification",
				context: {
					url,
					name,
				},
				locale,
			});
		},
	},
	socialProviders: {
		google: {
			clientId: process.env["GOOGLE_CLIENT_ID"] as string,
			clientSecret: process.env["GOOGLE_CLIENT_SECRET"] as string,
			scope: ["email", "profile"],
		},
		github: {
			clientId: process.env["GITHUB_CLIENT_ID"] as string,
			clientSecret: process.env["GITHUB_CLIENT_SECRET"] as string,
			scope: ["user:email"],
		},
	},
	/**
	 * Better Auth plugins.
	 *
	 * Note: Cast to BetterAuthPlugin[] due to exactOptionalPropertyTypes incompatibility.
	 * Better Auth's plugin types use optional properties (e.g., `headers?: Headers`) that
	 * conflict with TypeScript's exactOptionalPropertyTypes setting, which treats
	 * `undefined` as a valid value for optional properties. The plugins work correctly
	 * at runtime; only the type definitions are incompatible.
	 *
	 * @see https://github.com/better-auth/better-auth/issues/1282
	 */
	plugins: [
		username(),
		admin(),
		passkey(),
		magicLink({
			disableSignUp: false,
			sendMagicLink: async ({ email, url }, request) => {
				const locale = getLocaleFromRequest(request);
				await sendEmail({
					to: email,
					templateId: "magicLink",
					context: {
						url,
					},
					locale,
				});
			},
		}),
		organization({
			ac,
			roles: {
				owner,
				admin: adminRole,
				member,
			},
			dynamicAccessControl: {
				enabled: true,
				maximumRolesPerOrganization: 20,
			},
			sendInvitationEmail: async (
				{ email, id, organization },
				request,
			) => {
				const locale = getLocaleFromRequest(request);
				const existingUser = await getUserByEmail(email);

				const url = new URL(
					existingUser ? "/login" : "/signup",
					getBaseUrl(),
				);

				url.searchParams.set("invitationId", id);
				url.searchParams.set("email", email);

				await sendEmail({
					to: email,
					templateId: "organizationInvitation",
					locale,
					context: {
						organizationName: organization.name,
						url: url.toString(),
					},
				});
			},
			organizationHooks: {},
		}),
		openAPI(),
		invitationOnlyPlugin(),
		twoFactor(),
	] as BetterAuthPlugin[],
	onAPIError: {
		onError(error) {
			// Log auth errors (the AuthContext doesn't have path/body/request info)
			// Failed login tracking is handled in the hooks via createAuthMiddleware
			logger.error(error);
		},
	},
});

export * from "./lib/organization";

// Base session type from better-auth
type BaseSession = typeof auth.$Infer.Session;

/**
 * Extended User type with additional fields defined in auth config
 */
export interface User {
	id: string;
	email: string;
	emailVerified: boolean;
	name: string;
	image?: string | null;
	createdAt: Date;
	updatedAt: Date;
	// Additional fields from auth config
	onboardingComplete?: boolean;
	locale?: string | null;
	role?: string;
	banned?: boolean;
	banReason?: string | null;
	banExpires?: Date | null;
	twoFactorEnabled?: boolean;
}

/**
 * Extended Session type with additional fields from organization plugin
 */
export interface SessionData {
	id: string;
	userId: string;
	expiresAt: Date;
	token: string;
	createdAt: Date;
	updatedAt: Date;
	ipAddress?: string | null;
	userAgent?: string | null;
	// Additional fields from organization plugin
	activeOrganizationId?: string | null;
}

/**
 * Full session type with extended user and session data
 */
export interface Session {
	user: User;
	session: SessionData;
}

// Also export base session type for cases where full extension isn't needed
export type BaseSessionType = BaseSession;

// Re-export client-safe types from types.ts
// These are defined separately to allow client code to import them
// without pulling in server-only dependencies like @repo/database
export type {
	ActiveOrganization,
	Invitation,
	InvitationWithOrganization,
	Member,
	Organization,
	OrganizationInvitationStatus,
	OrganizationMember,
	OrganizationMemberRole,
	OrganizationMetadata,
} from "./types";

// Import types for use in AuthServerAPI
import type {
	ActiveOrganization,
	InvitationWithOrganization,
	Organization,
} from "./types";

/**
 * Type helper for auth.api methods that aren't properly inferred
 * due to exactOptionalPropertyTypes incompatibilities with better-auth
 */
export interface AuthServerAPI {
	getFullOrganization: (params: {
		query: { organizationSlug?: string; organizationId?: string };
		headers: Headers;
	}) => Promise<ActiveOrganization | null>;

	listOrganizations: (params: {
		headers: Headers;
	}) => Promise<Organization[]>;

	listPasskeys: (params: { headers: Headers }) => Promise<
		Array<{
			id: string;
			name?: string | null;
			createdAt: Date;
		}>
	>;

	getInvitation: (params: {
		query: { id: string };
		headers: Headers;
	}) => Promise<InvitationWithOrganization | null>;
}

// Export typed auth API helper
export const authApi = auth.api as typeof auth.api & AuthServerAPI;
