/**
 * Frontend types for organizations feature
 */

import type { PermissionRecord } from "@repo/auth/permissions";

/**
 * Organization role type from Better Auth listRoles API
 */
export interface Role {
	id: string;
	name: string;
	permissions: PermissionRecord;
}

/**
 * Audit log entry for organization activity
 */
export interface AuditLogEntry {
	id: string;
	action: string;
	resourceType: string;
	resourceId: string | null;
	metadata: Record<string, unknown> | null;
	ipAddress: string | null;
	userAgent: string | null;
	createdAt: string | Date;
	user: {
		id: string;
		name: string;
		email: string;
		image: string | null;
	} | null;
}
