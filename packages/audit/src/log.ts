import { createId } from "@paralleldrive/cuid2";
import { db, Prisma } from "@repo/database";
import type { AuditAction, ResourceType } from "./actions";

export interface AuditLogInput {
	action: AuditAction;
	resourceType: ResourceType;
	resourceId?: string;
	userId?: string;
	organizationId?: string;
	metadata?: Prisma.InputJsonValue;
	ipAddress?: string;
	userAgent?: string;
}

export interface AuditLogContext {
	userId?: string;
	organizationId?: string;
	ipAddress?: string;
	userAgent?: string;
}

/**
 * Creates an audit log entry in the database
 */
export async function createAuditLog(input: AuditLogInput) {
	const data: Prisma.AuditLogUncheckedCreateInput = {
		id: createId(),
		action: input.action,
		resourceType: input.resourceType,
		resourceId: input.resourceId ?? null,
		userId: input.userId ?? null,
		organizationId: input.organizationId ?? null,
		metadata: input.metadata ?? Prisma.JsonNull,
		ipAddress: input.ipAddress ?? null,
		userAgent: input.userAgent ?? null,
	};
	return db.auditLog.create({ data });
}

/**
 * Creates an audit logger with pre-set context (user, org, IP, etc.)
 * This is useful for creating a logger instance for a request context
 */
export function createAuditLogger(context: AuditLogContext) {
	return {
		log: (
			input: Omit<
				AuditLogInput,
				"userId" | "organizationId" | "ipAddress" | "userAgent"
			>,
		) => {
			const logInput: AuditLogInput = {
				...input,
			};
			if (context.userId) {
				logInput.userId = context.userId;
			}
			if (context.organizationId) {
				logInput.organizationId = context.organizationId;
			}
			if (context.ipAddress) {
				logInput.ipAddress = context.ipAddress;
			}
			if (context.userAgent) {
				logInput.userAgent = context.userAgent;
			}
			return createAuditLog(logInput);
		},
	};
}

/**
 * Query audit logs with filtering and pagination
 */
export interface AuditLogQueryOptions {
	userId?: string;
	organizationId?: string;
	action?: string;
	resourceType?: string;
	resourceId?: string;
	startDate?: Date;
	endDate?: Date;
	limit?: number;
	offset?: number;
}

export async function queryAuditLogs(options: AuditLogQueryOptions) {
	const where: Record<string, unknown> = {};

	if (options.userId) {
		where["userId"] = options.userId;
	}
	if (options.organizationId) {
		where["organizationId"] = options.organizationId;
	}
	if (options.action) {
		where["action"] = options.action;
	}
	if (options.resourceType) {
		where["resourceType"] = options.resourceType;
	}
	if (options.resourceId) {
		where["resourceId"] = options.resourceId;
	}
	if (options.startDate || options.endDate) {
		where["createdAt"] = {};
		if (options.startDate) {
			(where["createdAt"] as Record<string, Date>)["gte"] =
				options.startDate;
		}
		if (options.endDate) {
			(where["createdAt"] as Record<string, Date>)["lte"] =
				options.endDate;
		}
	}

	const [logs, total] = await Promise.all([
		db.auditLog.findMany({
			where,
			orderBy: { createdAt: "desc" },
			take: options.limit ?? 50,
			skip: options.offset ?? 0,
			include: {
				user: {
					select: {
						id: true,
						name: true,
						email: true,
						image: true,
					},
				},
				organization: {
					select: {
						id: true,
						name: true,
						slug: true,
					},
				},
			},
		}),
		db.auditLog.count({ where }),
	]);

	return {
		logs,
		total,
		limit: options.limit ?? 50,
		offset: options.offset ?? 0,
	};
}

/**
 * Get audit logs for a specific resource
 */
export async function getResourceAuditLogs(
	resourceType: ResourceType,
	resourceId: string,
	options: { limit?: number; offset?: number } = {},
) {
	return queryAuditLogs({
		resourceType,
		resourceId,
		...options,
	});
}

/**
 * Get recent audit logs for an organization
 * This includes:
 * 1. Audit logs directly tied to the organization (organizationId matches)
 * 2. Auth events (login, logout, etc.) for all members of the organization
 *    These are user-level events without an organizationId, but are relevant
 *    for organization admins to see member activity
 */
export async function getOrganizationAuditLogs(
	organizationId: string,
	options: {
		action?: string;
		startDate?: Date;
		endDate?: Date;
		limit?: number;
		offset?: number;
	} = {},
) {
	// First get all member user IDs for this organization
	const members = await db.member.findMany({
		where: { organizationId },
		select: { userId: true },
	});
	const memberUserIds = members.map((m) => m.userId);

	// Build the base OR conditions
	const orConditions: Record<string, unknown>[] = [
		// Organization-level logs (member invites, role changes, org settings, etc.)
		{ organizationId },
	];

	// Only include auth events for members (login, logout, 2FA, passkeys, etc.)
	// These are user-level events that don't have an organizationId
	// We explicitly filter to auth.* actions to avoid leaking other user events
	if (memberUserIds.length > 0) {
		orConditions.push({
			userId: { in: memberUserIds },
			organizationId: null,
			action: { startsWith: "auth." },
		});
	}

	// Build the where clause
	const where: Record<string, unknown> = {
		OR: orConditions,
	};

	// Add action filter if provided (filter by prefix for category filtering)
	// This is applied on top of the base query
	if (options.action) {
		where["AND"] = [{ action: { startsWith: options.action } }];
	}

	// Add date range filters
	if (options.startDate || options.endDate) {
		const dateFilter: Record<string, Date> = {};
		if (options.startDate) {
			dateFilter["gte"] = options.startDate;
		}
		if (options.endDate) {
			dateFilter["lte"] = options.endDate;
		}
		if (where["AND"]) {
			(where["AND"] as Record<string, unknown>[]).push({
				createdAt: dateFilter,
			});
		} else {
			where["AND"] = [{ createdAt: dateFilter }];
		}
	}

	const [logs, total] = await Promise.all([
		db.auditLog.findMany({
			where,
			orderBy: { createdAt: "desc" },
			take: options.limit ?? 50,
			skip: options.offset ?? 0,
			include: {
				user: {
					select: {
						id: true,
						name: true,
						email: true,
						image: true,
					},
				},
				organization: {
					select: {
						id: true,
						name: true,
						slug: true,
					},
				},
			},
		}),
		db.auditLog.count({ where }),
	]);

	return {
		logs,
		total,
		limit: options.limit ?? 50,
		offset: options.offset ?? 0,
	};
}

/**
 * Get recent audit logs for a user
 */
export async function getUserAuditLogs(
	userId: string,
	options: {
		action?: string;
		startDate?: Date;
		endDate?: Date;
		limit?: number;
		offset?: number;
	} = {},
) {
	return queryAuditLogs({
		userId,
		...options,
	});
}
