import { ORPCError } from "@orpc/server";
import { dealerAudit, getAuditContextFromHeaders } from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { requireDealerInScope, resolveDealerScope } from "../lib/scope";

/**
 * Grant or revoke a dealer's customer payment reminders (WhatsApp + SMS the
 * day before an unpaid invoice expires, and the pending-stop notice). The
 * sends go out on the operator's Salti + GlobeSMS accounts, so only the
 * wholesale operator can switch them on for a dealer; the dealer's own
 * settings page then only has an on/off switch.
 *
 * Granting also turns the dealer org's switch on (grant = on); the dealer
 * can still turn it off. Revoking leaves the switch alone — the grant alone
 * stops every send.
 */
export const setDealerReminderGrant = protectedProcedure
	.route({
		method: "POST",
		path: "/dealers/finance/{dealerId}/reminder-grant",
		tags: ["Dealers"],
		summary: "Grant or revoke a dealer's customer payment reminders",
	})
	.input(
		z.object({
			organizationId: z.string(),
			dealerId: z.string(),
			allowed: z.boolean(),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const scope = await resolveDealerScope(
			input.organizationId,
			user.id,
			"manage",
		);
		if (!scope.canManage) {
			throw new ORPCError("FORBIDDEN", {
				message:
					"Only the network operator's organization can grant customer reminders.",
			});
		}
		const dealer = await requireDealerInScope(scope, input.dealerId);
		const dealerOrg = dealer.activeForOrganization;
		if (!dealerOrg) {
			throw new ORPCError("BAD_REQUEST", {
				message: "This dealer has no LibanCom account.",
			});
		}

		await db.organization.update({
			where: { id: dealerOrg.id },
			data: input.allowed
				? { expiryReminderAllowed: true, expiryReminderEnabled: true }
				: { expiryReminderAllowed: false },
			select: { id: true },
		});

		dealerAudit.reminderGrantChanged(
			dealer.id,
			user.id,
			scope.organizationId,
			getAuditContextFromHeaders(headers),
			{
				dealerName: dealer.name,
				dealerOrganizationId: dealerOrg.id,
				allowed: input.allowed,
			},
		);

		return { allowed: input.allowed, organizationName: dealerOrg.name };
	});

const limitSchema = z.number().int().min(0).max(100).nullable();
const rateSchema = z.number().finite().min(0).max(1000);

/**
 * Operator-set limits and rates for a dealer org's customer messages:
 * how many times "notify customer" may message one customer per calendar
 * month on each channel (null = no limit; the daily expiry reminder is not
 * limited), and what the operator charges per message. The rates are only
 * recorded for now — nothing is billed from them yet.
 */
export const setDealerNotificationLimits = protectedProcedure
	.route({
		method: "POST",
		path: "/dealers/finance/{dealerId}/notification-limits",
		tags: ["Dealers"],
		summary: "Set a dealer's stop-notice limits and per-message rates",
	})
	.input(
		z.object({
			organizationId: z.string(),
			dealerId: z.string(),
			stopNoticeSmsLimit: limitSchema,
			stopNoticeWhatsappLimit: limitSchema,
			stopNoticeRate: rateSchema,
			expiryReminderRate: rateSchema,
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const scope = await resolveDealerScope(
			input.organizationId,
			user.id,
			"manage",
		);
		if (!scope.canManage) {
			throw new ORPCError("FORBIDDEN", {
				message:
					"Only the network operator's organization can set a dealer's notification limits.",
			});
		}
		const dealer = await requireDealerInScope(scope, input.dealerId);
		const dealerOrg = dealer.activeForOrganization;
		if (!dealerOrg) {
			throw new ORPCError("BAD_REQUEST", {
				message: "This dealer has no LibanCom account.",
			});
		}

		const limits = {
			stopNoticeSmsLimit: input.stopNoticeSmsLimit,
			stopNoticeWhatsappLimit: input.stopNoticeWhatsappLimit,
			stopNoticeRate: input.stopNoticeRate,
			expiryReminderRate: input.expiryReminderRate,
		};
		await db.organization.update({
			where: { id: dealerOrg.id },
			data: limits,
			select: { id: true },
		});

		dealerAudit.reminderGrantChanged(
			dealer.id,
			user.id,
			scope.organizationId,
			getAuditContextFromHeaders(headers),
			{
				dealerName: dealer.name,
				dealerOrganizationId: dealerOrg.id,
				allowed: dealerOrg.expiryReminderAllowed,
				limits,
			},
		);

		return limits;
	});
