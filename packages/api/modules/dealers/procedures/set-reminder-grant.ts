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
