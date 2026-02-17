import type { AuditAction, AuditLogInput, ResourceType } from "@repo/audit";
import { AUDIT_ACTIONS, createAuditLog, RESOURCE_TYPES } from "@repo/audit";
import { logger } from "@repo/logs";

// JSON-safe value type for metadata
type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue };

// JSON-safe record type for changes and other nested objects
type JsonRecord = { [key: string]: JsonValue };

export interface AuditContext {
	userId?: string;
	organizationId?: string;
	ipAddress?: string;
	userAgent?: string;
}

/**
 * Helper to extract IP address and user agent from request
 */
export function getRequestContext(request?: Request): {
	ipAddress?: string;
	userAgent?: string;
} {
	if (!request) {
		return {};
	}

	const ipAddress =
		request.headers.get("x-forwarded-for")?.split(",")[0] ||
		request.headers.get("x-real-ip") ||
		undefined;

	const userAgent = request.headers.get("user-agent") || undefined;

	const result: { ipAddress?: string; userAgent?: string } = {};
	if (ipAddress) {
		result.ipAddress = ipAddress;
	}
	if (userAgent) {
		result.userAgent = userAgent;
	}
	return result;
}

/**
 * Helper to extract audit context from Headers object (for oRPC procedures)
 */
export function getAuditContextFromHeaders(headers: Headers): AuditContext {
	const ipAddress =
		headers.get("x-forwarded-for")?.split(",")[0] ||
		headers.get("x-real-ip") ||
		undefined;
	const userAgent = headers.get("user-agent") || undefined;

	const context: AuditContext = {};
	if (ipAddress) {
		context.ipAddress = ipAddress;
	}
	if (userAgent) {
		context.userAgent = userAgent;
	}
	return context;
}

type LogAuthEventParams = {
	action: AuditAction;
	resourceType: ResourceType;
	resourceId?: string;
	userId?: string;
	organizationId?: string;
	metadata?: AuditLogInput["metadata"];
	ipAddress?: string;
	userAgent?: string;
};

/**
 * Helper to build log event params with proper context handling
 * Satisfies exactOptionalPropertyTypes by conditionally adding properties
 * Options accept string | undefined to handle optional chaining (e.g., metadata?.passkeyId)
 */
function buildLogEventParams(
	base: Pick<LogAuthEventParams, "action" | "resourceType">,
	options: {
		resourceId?: string | undefined;
		userId?: string | undefined;
		organizationId?: string | undefined;
		metadata?: AuditLogInput["metadata"] | undefined;
		context?: AuditContext | undefined;
	},
): LogAuthEventParams {
	const params: LogAuthEventParams = {
		action: base.action,
		resourceType: base.resourceType,
	};
	if (options.resourceId) {
		params.resourceId = options.resourceId;
	}
	if (options.userId) {
		params.userId = options.userId;
	}
	if (options.organizationId) {
		params.organizationId = options.organizationId;
	}
	if (options.metadata) {
		params.metadata = options.metadata;
	}
	if (options.context?.ipAddress) {
		params.ipAddress = options.context.ipAddress;
	}
	if (options.context?.userAgent) {
		params.userAgent = options.context.userAgent;
	}
	return params;
}

/**
 * Log auth events asynchronously (fire and forget)
 * Type-safe: action and resourceType must be valid audit actions/resource types
 */
function logAuthEvent(params: LogAuthEventParams) {
	// Fire and forget - don't await to avoid slowing down auth flow
	// Build the audit log input with conditional property assignment
	// to satisfy exactOptionalPropertyTypes
	const auditInput: AuditLogInput = {
		action: params.action,
		resourceType: params.resourceType,
	};
	if (params.resourceId) {
		auditInput.resourceId = params.resourceId;
	}
	if (params.userId) {
		auditInput.userId = params.userId;
	}
	if (params.organizationId) {
		auditInput.organizationId = params.organizationId;
	}
	if (params.metadata) {
		auditInput.metadata = params.metadata;
	}
	if (params.ipAddress) {
		auditInput.ipAddress = params.ipAddress;
	}
	if (params.userAgent) {
		auditInput.userAgent = params.userAgent;
	}
	createAuditLog(auditInput).catch((error) => {
		logger.error("Failed to create audit log", { error, params });
	});
}

/**
 * Auth event audit logging functions
 */
export const authAudit = {
	login: (
		userId: string,
		context: AuditContext,
		metadata?: { provider?: string },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.auth.login,
					resourceType: RESOURCE_TYPES.user,
				},
				{ resourceId: userId, userId, metadata, context },
			),
		);
	},

	logout: (userId: string, context: AuditContext) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.auth.logout,
					resourceType: RESOURCE_TYPES.user,
				},
				{ resourceId: userId, userId, context },
			),
		);
	},

	signup: (
		userId: string,
		context: AuditContext,
		metadata?: { provider?: string; email?: string },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.auth.signup,
					resourceType: RESOURCE_TYPES.user,
				},
				{ resourceId: userId, userId, metadata, context },
			),
		);
	},

	passwordChanged: (userId: string, context: AuditContext) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.auth.passwordChanged,
					resourceType: RESOURCE_TYPES.user,
				},
				{ resourceId: userId, userId, context },
			),
		);
	},

	passwordReset: (
		userId: string,
		context: AuditContext,
		metadata?: { email?: string },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.auth.passwordReset,
					resourceType: RESOURCE_TYPES.user,
				},
				{ resourceId: userId, userId, metadata, context },
			),
		);
	},

	twoFactorEnabled: (userId: string, context: AuditContext) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.auth.twoFactorEnabled,
					resourceType: RESOURCE_TYPES.user,
				},
				{ resourceId: userId, userId, context },
			),
		);
	},

	twoFactorDisabled: (userId: string, context: AuditContext) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.auth.twoFactorDisabled,
					resourceType: RESOURCE_TYPES.user,
				},
				{ resourceId: userId, userId, context },
			),
		);
	},

	passkeyAdded: (
		userId: string,
		context: AuditContext,
		metadata?: { passkeyId?: string; name?: string },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.auth.passkeyAdded,
					resourceType: RESOURCE_TYPES.passkey,
				},
				{ resourceId: metadata?.passkeyId, userId, metadata, context },
			),
		);
	},

	passkeyRemoved: (
		userId: string,
		context: AuditContext,
		metadata?: { passkeyId?: string },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.auth.passkeyRemoved,
					resourceType: RESOURCE_TYPES.passkey,
				},
				{ resourceId: metadata?.passkeyId, userId, metadata, context },
			),
		);
	},

	socialAccountLinked: (
		userId: string,
		context: AuditContext,
		metadata?: { provider?: string; accountEmail?: string },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.auth.socialAccountLinked,
					resourceType: RESOURCE_TYPES.user,
				},
				{ resourceId: userId, userId, metadata, context },
			),
		);
	},

	socialAccountUnlinked: (
		userId: string,
		context: AuditContext,
		metadata?: { provider?: string },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.auth.socialAccountUnlinked,
					resourceType: RESOURCE_TYPES.user,
				},
				{ resourceId: userId, userId, metadata, context },
			),
		);
	},
};

/**
 * Organization event audit logging functions
 */
export const organizationAudit = {
	created: (
		organizationId: string,
		userId: string,
		context: AuditContext,
		metadata?: { name?: string; slug?: string },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.organization.created,
					resourceType: RESOURCE_TYPES.organization,
				},
				{
					resourceId: organizationId,
					userId,
					organizationId,
					metadata,
					context,
				},
			),
		);
	},

	updated: (
		organizationId: string,
		userId: string,
		context: AuditContext,
		metadata?: { changes?: JsonRecord },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.organization.updated,
					resourceType: RESOURCE_TYPES.organization,
				},
				{
					resourceId: organizationId,
					userId,
					organizationId,
					metadata,
					context,
				},
			),
		);
	},

	deleted: (
		organizationId: string,
		userId: string,
		context: AuditContext,
		metadata?: { name?: string },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.organization.deleted,
					resourceType: RESOURCE_TYPES.organization,
				},
				{
					resourceId: organizationId,
					userId,
					organizationId,
					metadata,
					context,
				},
			),
		);
	},
};

/**
 * Member event audit logging functions
 */
export const memberAudit = {
	invited: (
		organizationId: string,
		inviterId: string,
		context: AuditContext,
		metadata?: { email?: string; role?: string; invitationId?: string },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.member.invited,
					resourceType: RESOURCE_TYPES.invitation,
				},
				{
					resourceId: metadata?.invitationId,
					userId: inviterId,
					organizationId,
					metadata,
					context,
				},
			),
		);
	},

	joined: (
		organizationId: string,
		userId: string,
		context: AuditContext,
		metadata?: { role?: string; invitationId?: string },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.member.joined,
					resourceType: RESOURCE_TYPES.member,
				},
				{
					resourceId: userId,
					userId,
					organizationId,
					metadata,
					context,
				},
			),
		);
	},

	removed: (
		organizationId: string,
		removerId: string,
		context: AuditContext,
		metadata?: { memberId?: string; memberEmail?: string },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.member.removed,
					resourceType: RESOURCE_TYPES.member,
				},
				{
					resourceId: metadata?.memberId,
					userId: removerId,
					organizationId,
					metadata,
					context,
				},
			),
		);
	},

	left: (organizationId: string, userId: string, context: AuditContext) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.member.left,
					resourceType: RESOURCE_TYPES.member,
				},
				{ resourceId: userId, userId, organizationId, context },
			),
		);
	},

	roleChanged: (
		organizationId: string,
		changerId: string,
		context: AuditContext,
		metadata?: { memberId?: string; oldRole?: string; newRole?: string },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.member.roleChanged,
					resourceType: RESOURCE_TYPES.member,
				},
				{
					resourceId: metadata?.memberId,
					userId: changerId,
					organizationId,
					metadata,
					context,
				},
			),
		);
	},
};

/**
 * Role event audit logging functions
 */
export const roleAudit = {
	created: (
		organizationId: string,
		userId: string,
		context: AuditContext,
		metadata?: { roleId?: string; roleName?: string },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.role.created,
					resourceType: RESOURCE_TYPES.role,
				},
				{
					resourceId: metadata?.roleId,
					userId,
					organizationId,
					metadata,
					context,
				},
			),
		);
	},

	updated: (
		organizationId: string,
		userId: string,
		context: AuditContext,
		metadata?: { roleId?: string; changes?: JsonRecord },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.role.updated,
					resourceType: RESOURCE_TYPES.role,
				},
				{
					resourceId: metadata?.roleId,
					userId,
					organizationId,
					metadata,
					context,
				},
			),
		);
	},

	deleted: (
		organizationId: string,
		userId: string,
		context: AuditContext,
		metadata?: { roleId?: string; roleName?: string },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.role.deleted,
					resourceType: RESOURCE_TYPES.role,
				},
				{
					resourceId: metadata?.roleId,
					userId,
					organizationId,
					metadata,
					context,
				},
			),
		);
	},
};

/**
 * User event audit logging functions
 */
export const userAudit = {
	created: (
		userId: string,
		context: AuditContext,
		metadata?: { email?: string },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.user.created,
					resourceType: RESOURCE_TYPES.user,
				},
				{ resourceId: userId, userId, metadata, context },
			),
		);
	},

	updated: (
		userId: string,
		context: AuditContext,
		metadata?: { changes?: JsonRecord },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.user.updated,
					resourceType: RESOURCE_TYPES.user,
				},
				{ resourceId: userId, userId, metadata, context },
			),
		);
	},

	deleted: (userId: string, context: AuditContext) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.user.deleted,
					resourceType: RESOURCE_TYPES.user,
				},
				{ resourceId: userId, userId, context },
			),
		);
	},
};

/**
 * API key event audit logging functions
 */
export const apiKeyAudit = {
	created: (
		apiKeyId: string,
		userId: string,
		organizationId: string,
		context: AuditContext,
		metadata?: { name?: string; permissions?: string[] },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.apiKey.created,
					resourceType: RESOURCE_TYPES.apiKey,
				},
				{
					resourceId: apiKeyId,
					userId,
					organizationId,
					metadata,
					context,
				},
			),
		);
	},

	revoked: (
		apiKeyId: string,
		userId: string,
		organizationId: string,
		context: AuditContext,
		metadata?: { name?: string },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.apiKey.revoked,
					resourceType: RESOURCE_TYPES.apiKey,
				},
				{
					resourceId: apiKeyId,
					userId,
					organizationId,
					metadata,
					context,
				},
			),
		);
	},
};

/**
 * Webhook event audit logging functions
 */
export const webhookAudit = {
	created: (
		webhookId: string,
		userId: string,
		organizationId: string,
		context: AuditContext,
		metadata?: { url?: string; events?: string[] },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.webhook.created,
					resourceType: RESOURCE_TYPES.webhook,
				},
				{
					resourceId: webhookId,
					userId,
					organizationId,
					metadata,
					context,
				},
			),
		);
	},

	updated: (
		webhookId: string,
		userId: string,
		organizationId: string,
		context: AuditContext,
		metadata?: { changedFields?: string[] },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.webhook.updated,
					resourceType: RESOURCE_TYPES.webhook,
				},
				{
					resourceId: webhookId,
					userId,
					organizationId,
					metadata,
					context,
				},
			),
		);
	},

	deleted: (
		webhookId: string,
		userId: string,
		organizationId: string,
		context: AuditContext,
		metadata?: { url?: string },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.webhook.deleted,
					resourceType: RESOURCE_TYPES.webhook,
				},
				{
					resourceId: webhookId,
					userId,
					organizationId,
					metadata,
					context,
				},
			),
		);
	},

	tested: (
		webhookId: string,
		userId: string,
		organizationId: string,
		context: AuditContext,
		metadata?: { success?: boolean; statusCode?: number },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.webhook.tested,
					resourceType: RESOURCE_TYPES.webhook,
				},
				{
					resourceId: webhookId,
					userId,
					organizationId,
					metadata,
					context,
				},
			),
		);
	},
};

/**
 * AI agent audit logging functions
 */
export const aiAgentAudit = {
	created: (
		agentId: string,
		userId: string,
		organizationId: string,
		context: AuditContext,
		metadata?: { name?: string; model?: string },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.aiAgent.created,
					resourceType: RESOURCE_TYPES.aiAgent,
				},
				{
					resourceId: agentId,
					userId,
					organizationId,
					metadata,
					context,
				},
			),
		);
	},

	updated: (
		agentId: string,
		userId: string,
		organizationId: string,
		context: AuditContext,
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.aiAgent.updated,
					resourceType: RESOURCE_TYPES.aiAgent,
				},
				{
					resourceId: agentId,
					userId,
					organizationId,
					context,
				},
			),
		);
	},

	deleted: (
		agentId: string,
		userId: string,
		organizationId: string,
		context: AuditContext,
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.aiAgent.deleted,
					resourceType: RESOURCE_TYPES.aiAgent,
				},
				{
					resourceId: agentId,
					userId,
					organizationId,
					context,
				},
			),
		);
	},

	webChatToggled: (
		agentId: string,
		userId: string,
		organizationId: string,
		context: AuditContext,
		metadata?: { enabled?: boolean },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.aiAgent.webChatToggled,
					resourceType: RESOURCE_TYPES.aiAgent,
				},
				{
					resourceId: agentId,
					userId,
					organizationId,
					metadata,
					context,
				},
			),
		);
	},
};

/**
 * Watcher audit logging functions
 */
export const watcherAudit = {
	created: (
		watcherId: string,
		userId: string,
		organizationId: string,
		context: AuditContext,
		metadata?: { name?: string; type?: string },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.watcher.created,
					resourceType: RESOURCE_TYPES.watcher,
				},
				{
					resourceId: watcherId,
					userId,
					organizationId,
					metadata,
					context,
				},
			),
		);
	},

	updated: (
		watcherId: string,
		userId: string,
		organizationId: string,
		context: AuditContext,
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.watcher.updated,
					resourceType: RESOURCE_TYPES.watcher,
				},
				{
					resourceId: watcherId,
					userId,
					organizationId,
					context,
				},
			),
		);
	},

	deleted: (
		watcherId: string,
		userId: string,
		organizationId: string,
		context: AuditContext,
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.watcher.deleted,
					resourceType: RESOURCE_TYPES.watcher,
				},
				{
					resourceId: watcherId,
					userId,
					organizationId,
					context,
				},
			),
		);
	},

	toggled: (
		watcherId: string,
		userId: string,
		organizationId: string,
		context: AuditContext,
		metadata?: { enabled?: boolean },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.watcher.toggled,
					resourceType: RESOURCE_TYPES.watcher,
				},
				{
					resourceId: watcherId,
					userId,
					organizationId,
					metadata,
					context,
				},
			),
		);
	},
};

/**
 * AI agent channel audit logging functions
 */
export const aiChannelAudit = {
	created: (
		channelId: string,
		userId: string,
		organizationId: string,
		context: AuditContext,
		metadata?: { provider?: string; name?: string },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.aiChannel.created,
					resourceType: RESOURCE_TYPES.aiChannel,
				},
				{
					resourceId: channelId,
					userId,
					organizationId,
					metadata,
					context,
				},
			),
		);
	},

	deleted: (
		channelId: string,
		userId: string,
		organizationId: string,
		context: AuditContext,
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.aiChannel.deleted,
					resourceType: RESOURCE_TYPES.aiChannel,
				},
				{
					resourceId: channelId,
					userId,
					organizationId,
					context,
				},
			),
		);
	},
};

/**
 * Customer audit logging functions
 */
export const customerAudit = {
	created: (
		customerId: string,
		userId: string,
		organizationId: string,
		context: AuditContext,
		metadata?: { fullName?: string; accountNumber?: string },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.customer.created,
					resourceType: RESOURCE_TYPES.customer,
				},
				{
					resourceId: customerId,
					userId,
					organizationId,
					metadata,
					context,
				},
			),
		);
	},

	updated: (
		customerId: string,
		userId: string,
		organizationId: string,
		context: AuditContext,
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.customer.updated,
					resourceType: RESOURCE_TYPES.customer,
				},
				{
					resourceId: customerId,
					userId,
					organizationId,
					context,
				},
			),
		);
	},

	deleted: (
		customerId: string,
		userId: string,
		organizationId: string,
		context: AuditContext,
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.customer.deleted,
					resourceType: RESOURCE_TYPES.customer,
				},
				{
					resourceId: customerId,
					userId,
					organizationId,
					context,
				},
			),
		);
	},

	imported: (
		userId: string,
		organizationId: string,
		context: AuditContext,
		metadata?: { count?: number; operationId?: string },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.customer.imported,
					resourceType: RESOURCE_TYPES.customer,
				},
				{
					userId,
					organizationId,
					metadata,
					context,
				},
			),
		);
	},

	exported: (
		userId: string,
		organizationId: string,
		context: AuditContext,
		metadata?: { count?: number },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.customer.exported,
					resourceType: RESOURCE_TYPES.customer,
				},
				{
					userId,
					organizationId,
					metadata,
					context,
				},
			),
		);
	},

	pinUpdated: (
		customerId: string,
		userId: string,
		organizationId: string,
		context: AuditContext,
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.customer.pinUpdated,
					resourceType: RESOURCE_TYPES.customer,
				},
				{
					resourceId: customerId,
					userId,
					organizationId,
					context,
				},
			),
		);
	},

	pinReset: (
		customerId: string,
		userId: string,
		organizationId: string,
		context: AuditContext,
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.customer.pinReset,
					resourceType: RESOURCE_TYPES.customer,
				},
				{
					resourceId: customerId,
					userId,
					organizationId,
					context,
				},
			),
		);
	},

	pinGenerated: (
		customerId: string,
		userId: string,
		organizationId: string,
		context: AuditContext,
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.customer.pinGenerated,
					resourceType: RESOURCE_TYPES.customer,
				},
				{
					resourceId: customerId,
					userId,
					organizationId,
					context,
				},
			),
		);
	},
};

/**
 * Service plan audit logging functions
 */
export const servicePlanAudit = {
	created: (
		planId: string,
		userId: string,
		organizationId: string,
		context: AuditContext,
		metadata?: { name?: string },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.servicePlan.created,
					resourceType: RESOURCE_TYPES.servicePlan,
				},
				{
					resourceId: planId,
					userId,
					organizationId,
					metadata,
					context,
				},
			),
		);
	},

	updated: (
		planId: string,
		userId: string,
		organizationId: string,
		context: AuditContext,
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.servicePlan.updated,
					resourceType: RESOURCE_TYPES.servicePlan,
				},
				{
					resourceId: planId,
					userId,
					organizationId,
					context,
				},
			),
		);
	},

	deleted: (
		planId: string,
		userId: string,
		organizationId: string,
		context: AuditContext,
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.servicePlan.deleted,
					resourceType: RESOURCE_TYPES.servicePlan,
				},
				{
					resourceId: planId,
					userId,
					organizationId,
					context,
				},
			),
		);
	},
};

/**
 * Station audit logging functions
 */
export const stationAudit = {
	created: (
		stationId: string,
		userId: string,
		organizationId: string,
		context: AuditContext,
		metadata?: { name?: string },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.station.created,
					resourceType: RESOURCE_TYPES.station,
				},
				{
					resourceId: stationId,
					userId,
					organizationId,
					metadata,
					context,
				},
			),
		);
	},

	updated: (
		stationId: string,
		userId: string,
		organizationId: string,
		context: AuditContext,
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.station.updated,
					resourceType: RESOURCE_TYPES.station,
				},
				{
					resourceId: stationId,
					userId,
					organizationId,
					context,
				},
			),
		);
	},

	deleted: (
		stationId: string,
		userId: string,
		organizationId: string,
		context: AuditContext,
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.station.deleted,
					resourceType: RESOURCE_TYPES.station,
				},
				{
					resourceId: stationId,
					userId,
					organizationId,
					context,
				},
			),
		);
	},
};

/**
 * Employee audit logging functions
 */
export const employeeAudit = {
	created: (
		employeeId: string,
		userId: string,
		organizationId: string,
		context: AuditContext,
		metadata?: { name?: string; employeeNumber?: string },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.employee.created,
					resourceType: RESOURCE_TYPES.employee,
				},
				{
					resourceId: employeeId,
					userId,
					organizationId,
					metadata,
					context,
				},
			),
		);
	},

	updated: (
		employeeId: string,
		userId: string,
		organizationId: string,
		context: AuditContext,
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.employee.updated,
					resourceType: RESOURCE_TYPES.employee,
				},
				{
					resourceId: employeeId,
					userId,
					organizationId,
					context,
				},
			),
		);
	},

	deleted: (
		employeeId: string,
		userId: string,
		organizationId: string,
		context: AuditContext,
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.employee.deleted,
					resourceType: RESOURCE_TYPES.employee,
				},
				{
					resourceId: employeeId,
					userId,
					organizationId,
					context,
				},
			),
		);
	},

	imported: (
		userId: string,
		organizationId: string,
		context: AuditContext,
		metadata?: { count?: number },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.employee.imported,
					resourceType: RESOURCE_TYPES.employee,
				},
				{
					userId,
					organizationId,
					metadata,
					context,
				},
			),
		);
	},

	exported: (
		userId: string,
		organizationId: string,
		context: AuditContext,
		metadata?: { count?: number },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.employee.exported,
					resourceType: RESOURCE_TYPES.employee,
				},
				{
					userId,
					organizationId,
					metadata,
					context,
				},
			),
		);
	},

	stationsAssigned: (
		employeeId: string,
		userId: string,
		organizationId: string,
		context: AuditContext,
		metadata?: { stationIds?: string[] },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.employee.stationsAssigned,
					resourceType: RESOURCE_TYPES.employee,
				},
				{
					resourceId: employeeId,
					userId,
					organizationId,
					metadata,
					context,
				},
			),
		);
	},
};

/**
 * Task audit logging functions
 */
export const taskAudit = {
	created: (
		taskId: string,
		userId: string,
		organizationId: string,
		context: AuditContext,
		metadata?: { title?: string },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.task.created,
					resourceType: RESOURCE_TYPES.task,
				},
				{
					resourceId: taskId,
					userId,
					organizationId,
					metadata,
					context,
				},
			),
		);
	},

	updated: (
		taskId: string,
		userId: string,
		organizationId: string,
		context: AuditContext,
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.task.updated,
					resourceType: RESOURCE_TYPES.task,
				},
				{
					resourceId: taskId,
					userId,
					organizationId,
					context,
				},
			),
		);
	},

	deleted: (
		taskId: string,
		userId: string,
		organizationId: string,
		context: AuditContext,
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.task.deleted,
					resourceType: RESOURCE_TYPES.task,
				},
				{
					resourceId: taskId,
					userId,
					organizationId,
					context,
				},
			),
		);
	},

	employeesAssigned: (
		taskId: string,
		userId: string,
		organizationId: string,
		context: AuditContext,
		metadata?: { employeeIds?: string[] },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.task.employeesAssigned,
					resourceType: RESOURCE_TYPES.task,
				},
				{
					resourceId: taskId,
					userId,
					organizationId,
					metadata,
					context,
				},
			),
		);
	},
};

/**
 * Data export/deletion audit logging functions
 */
export const dataAudit = {
	exported: (userId: string, context: AuditContext) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.data.exported,
					resourceType: RESOURCE_TYPES.user,
				},
				{ resourceId: userId, userId, context },
			),
		);
	},

	deletionRequested: (
		userId: string,
		context: AuditContext,
		metadata?: { scheduledFor?: string },
	) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.data.deletionRequested,
					resourceType: RESOURCE_TYPES.user,
				},
				{ resourceId: userId, userId, metadata, context },
			),
		);
	},

	deletionCanceled: (userId: string, context: AuditContext) => {
		logAuthEvent(
			buildLogEventParams(
				{
					action: AUDIT_ACTIONS.data.deletionCompleted,
					resourceType: RESOURCE_TYPES.user,
				},
				{ resourceId: userId, userId, context },
			),
		);
	},
};
