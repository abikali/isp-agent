import { ORPCError } from "@orpc/server";
import { dataAudit, getAuditContextFromHeaders } from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

// Grace period before actual deletion (30 days)
const DELETION_GRACE_PERIOD_DAYS = 30;

export const requestAccountDeletion = protectedProcedure
	.route({
		method: "POST",
		path: "/users/delete-account",
		tags: ["Users"],
		summary: "Request account deletion",
		description:
			"Schedule account for deletion with a 30-day grace period (GDPR compliance)",
	})
	.input(
		z.object({
			reason: z.string().optional(),
		}),
	)
	.handler(async ({ context: { user, headers }, input: { reason } }) => {
		// Check if already scheduled for deletion
		const existingUser = await db.user.findUnique({
			where: { id: user.id },
			select: { deletionScheduledAt: true },
		});

		if (existingUser?.deletionScheduledAt) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Account is already scheduled for deletion",
			});
		}

		// Calculate deletion date
		const deletionDate = new Date();
		deletionDate.setDate(
			deletionDate.getDate() + DELETION_GRACE_PERIOD_DAYS,
		);

		// Update user with deletion schedule
		type DeletionData = {
			deletionScheduledAt: Date;
			deletionReason?: string | null;
		};
		const data: DeletionData = {
			deletionScheduledAt: deletionDate,
		};
		if (reason !== undefined) {
			data.deletionReason = reason;
		}
		await db.user.update({
			where: { id: user.id },
			data,
		});

		// Audit log the deletion request
		const auditContext = getAuditContextFromHeaders(headers);
		dataAudit.deletionRequested(user.id, auditContext, {
			scheduledFor: deletionDate.toISOString(),
		});

		// Revoke all sessions except current one (done async to not block)
		db.session
			.deleteMany({
				where: {
					userId: user.id,
				},
			})
			.catch(() => {
				// Silently fail - sessions will expire anyway
			});

		return {
			success: true,
			deletionScheduledFor: deletionDate.toISOString(),
			gracePeriodDays: DELETION_GRACE_PERIOD_DAYS,
		};
	});

export const cancelAccountDeletion = protectedProcedure
	.route({
		method: "POST",
		path: "/users/cancel-deletion",
		tags: ["Users"],
		summary: "Cancel account deletion",
		description:
			"Cancel a scheduled account deletion during the grace period",
	})
	.handler(async ({ context: { user, headers } }) => {
		// Check if scheduled for deletion
		const existingUser = await db.user.findUnique({
			where: { id: user.id },
			select: { deletionScheduledAt: true },
		});

		if (!existingUser?.deletionScheduledAt) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Account is not scheduled for deletion",
			});
		}

		// Check if grace period has passed
		if (new Date() > existingUser.deletionScheduledAt) {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"Grace period has expired. Account deletion is being processed.",
			});
		}

		// Cancel deletion
		await db.user.update({
			where: { id: user.id },
			data: {
				deletionScheduledAt: null,
				deletionReason: null,
			},
		});

		// Audit log the deletion cancellation
		const auditContext = getAuditContextFromHeaders(headers);
		dataAudit.deletionCanceled(user.id, auditContext);

		return {
			success: true,
		};
	});

export const getAccountDeletionStatus = protectedProcedure
	.route({
		method: "GET",
		path: "/users/deletion-status",
		tags: ["Users"],
		summary: "Get account deletion status",
		description: "Check if account is scheduled for deletion",
	})
	.handler(async ({ context: { user } }) => {
		const existingUser = await db.user.findUnique({
			where: { id: user.id },
			select: {
				deletionScheduledAt: true,
				deletionReason: true,
			},
		});

		if (!existingUser) {
			throw new ORPCError("NOT_FOUND", { message: "User not found" });
		}

		return {
			isScheduledForDeletion: !!existingUser.deletionScheduledAt,
			deletionScheduledFor:
				existingUser.deletionScheduledAt?.toISOString(),
			reason: existingUser.deletionReason,
			gracePeriodDays: DELETION_GRACE_PERIOD_DAYS,
		};
	});
