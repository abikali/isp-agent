// Audit action types organized by resource
export const AUDIT_ACTIONS = {
	// Authentication actions
	auth: {
		login: "auth.login",
		logout: "auth.logout",
		signup: "auth.signup",
		loginFailed: "auth.login_failed",
		passwordChange: "auth.password_change",
		passwordChanged: "auth.password_changed",
		passwordReset: "auth.password_reset",
		emailVerified: "auth.email_verified",
		twoFactorEnabled: "auth.2fa_enabled",
		twoFactorDisabled: "auth.2fa_disabled",
		passkeyAdded: "auth.passkey_added",
		passkeyRemoved: "auth.passkey_removed",
		magicLinkSent: "auth.magic_link_sent",
		socialAccountLinked: "auth.social_account_linked",
		socialAccountUnlinked: "auth.social_account_unlinked",
	},

	// User actions
	user: {
		created: "user.created",
		updated: "user.updated",
		deleted: "user.deleted",
		banned: "user.banned",
		unbanned: "user.unbanned",
		impersonated: "user.impersonated",
	},

	// Organization actions
	organization: {
		created: "organization.created",
		updated: "organization.updated",
		deleted: "organization.deleted",
	},

	// Member actions
	member: {
		invited: "member.invited",
		joined: "member.joined",
		removed: "member.removed",
		left: "member.left",
		roleChanged: "member.role_changed",
		invitationRevoked: "member.invitation_revoked",
		invitationResent: "member.invitation_resent",
	},

	// Role actions
	role: {
		created: "role.created",
		updated: "role.updated",
		deleted: "role.deleted",
	},

	// Payment actions
	payment: {
		subscriptionCreated: "payment.subscription_created",
		subscriptionUpdated: "payment.subscription_updated",
		subscriptionCanceled: "payment.subscription_canceled",
		purchaseCompleted: "payment.purchase_completed",
	},

	// API key actions
	apiKey: {
		created: "api_key.created",
		revoked: "api_key.revoked",
	},

	// Webhook actions
	webhook: {
		created: "webhook.created",
		updated: "webhook.updated",
		deleted: "webhook.deleted",
		tested: "webhook.tested",
	},

	// Session actions
	session: {
		created: "session.created",
		revoked: "session.revoked",
		revokedAll: "session.revoked_all",
	},

	// Data export/deletion
	data: {
		exported: "data.exported",
		deletionRequested: "data.deletion_requested",
		deletionCompleted: "data.deletion_completed",
	},
} as const;

// Resource types for categorization
export const RESOURCE_TYPES = {
	user: "user",
	organization: "organization",
	member: "member",
	invitation: "invitation",
	role: "role",
	session: "session",
	subscription: "subscription",
	purchase: "purchase",
	apiKey: "api_key",
	webhook: "webhook",
	passkey: "passkey",
} as const;

// Type helper to extract all values from a nested const object
type ValueOf<T> = T[keyof T];
type NestedValueOf<T> = ValueOf<{
	[K in keyof T]: T[K] extends Record<string, string> ? ValueOf<T[K]> : never;
}>;

// Type exports
export type AuditAction = NestedValueOf<typeof AUDIT_ACTIONS>;

export type ResourceType = ValueOf<typeof RESOURCE_TYPES>;
