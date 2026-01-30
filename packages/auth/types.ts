/**
 * Client-safe type definitions for authentication
 *
 * These types are safe to import in client components and won't pull in
 * server-only dependencies like @repo/database.
 *
 * Import from "@repo/auth/types" instead of "@repo/auth" for client code.
 */

import type {
	Invitation,
	InvitationStatus,
	Member,
	Organization,
} from "better-auth/plugins";

/**
 * Member with user information for organization context
 */
export interface OrganizationMember {
	id: string;
	organizationId: string;
	role: string;
	createdAt: Date;
	userId: string;
	user: {
		email: string;
		name: string;
		image?: string | null;
	};
}

/**
 * Full organization with members and invitations
 * Based on better-auth's getFullOrganization return type
 */
export interface ActiveOrganization extends Organization {
	members: OrganizationMember[];
	invitations: Invitation[];
}

export type OrganizationMemberRole = string;

export type OrganizationInvitationStatus = InvitationStatus;

export type OrganizationMetadata = Record<string, unknown> | undefined;

/**
 * Extended invitation type returned from auth.api.getInvitation
 * Includes organization details not in the base Invitation type
 */
export interface InvitationWithOrganization extends Invitation {
	organizationName: string;
	organizationSlug: string;
}

// Re-export types from better-auth for convenience
export type { Organization, Invitation, Member };
