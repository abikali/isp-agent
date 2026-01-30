import { ORPCError } from "@orpc/server";
import { dataAudit, getAuditContextFromHeaders } from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import { rateLimitedProtectedProcedure } from "../../../orpc/procedures";

export const exportUserData = rateLimitedProtectedProcedure
	.route({
		method: "GET",
		path: "/users/export",
		tags: ["Users"],
		summary: "Export user data",
		description:
			"Export all personal data associated with the current user (GDPR compliance)",
	})
	.handler(async ({ context: { user, headers } }) => {
		// Fetch all user-related data
		const userData = await db.user.findUnique({
			where: { id: user.id },
			select: {
				id: true,
				name: true,
				email: true,
				emailVerified: true,
				image: true,
				createdAt: true,
				updatedAt: true,
				username: true,
				role: true,
				onboardingComplete: true,
				locale: true,
				displayUsername: true,
				twoFactorEnabled: true,
			},
		});

		if (!userData) {
			throw new ORPCError("NOT_FOUND", { message: "User not found" });
		}

		// Fetch sessions
		const sessions = await db.session.findMany({
			where: { userId: user.id },
			select: {
				id: true,
				ipAddress: true,
				userAgent: true,
				createdAt: true,
				expiresAt: true,
			},
		});

		// Fetch organization memberships
		const memberships = await db.member.findMany({
			where: { userId: user.id },
			select: {
				id: true,
				role: true,
				createdAt: true,
				organization: {
					select: {
						id: true,
						name: true,
						slug: true,
					},
				},
			},
		});

		// Fetch connected accounts (OAuth)
		const accounts = await db.account.findMany({
			where: { userId: user.id },
			select: {
				id: true,
				providerId: true,
				accountId: true,
				createdAt: true,
			},
		});

		// Fetch passkeys
		const passkeys = await db.passkey.findMany({
			where: { userId: user.id },
			select: {
				id: true,
				name: true,
				deviceType: true,
				createdAt: true,
			},
		});

		// Fetch purchases
		const purchases = await db.purchase.findMany({
			where: { userId: user.id },
			select: {
				id: true,
				type: true,
				productId: true,
				status: true,
				createdAt: true,
			},
		});

		// Fetch audit logs (user actions)
		const auditLogs = await db.auditLog.findMany({
			where: { userId: user.id },
			select: {
				id: true,
				action: true,
				resourceType: true,
				resourceId: true,
				metadata: true,
				createdAt: true,
			},
			orderBy: { createdAt: "desc" },
			take: 1000, // Limit to last 1000 entries
		});

		// Fetch invitations sent by user
		const invitationsSent = await db.invitation.findMany({
			where: { inviterId: user.id },
			select: {
				id: true,
				email: true,
				role: true,
				status: true,
				expiresAt: true,
			},
		});

		// Compile the export
		const exportData = {
			exportedAt: new Date().toISOString(),
			user: userData,
			sessions,
			memberships,
			connectedAccounts: accounts,
			passkeys,
			purchases,
			auditLogs,
			invitationsSent,
		};

		// Audit log the data export
		const auditContext = getAuditContextFromHeaders(headers);
		dataAudit.exported(user.id, auditContext);

		return exportData;
	});
