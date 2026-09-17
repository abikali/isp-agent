import { ORPCError } from "@orpc/server";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { notifyDealerWhatsApp, readDealerNotice } from "../lib/notify-dealer";
import { requireDealerInScope, resolveDealerScope } from "../lib/scope";

/**
 * Send a ledger entry's WhatsApp confirmation again — after a failure, after
 * the dealer's number was fixed, or when staff skipped it at the time. Reuses
 * the params stored with the entry so the dealer gets the figures as they
 * were when the money moved, not today's balance. The phone is re-resolved.
 */
export const resendDealerNotice = protectedProcedure
	.route({
		method: "POST",
		path: "/dealers/finance/{dealerId}/ledger/{entryId}/notice",
		tags: ["Dealers"],
		summary: "Resend a dealer ledger entry's WhatsApp confirmation",
	})
	.input(
		z.object({
			organizationId: z.string(),
			dealerId: z.string(),
			entryId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const scope = await resolveDealerScope(
			input.organizationId,
			user.id,
			"manage",
		);
		if (!scope.canManage) {
			throw new ORPCError("FORBIDDEN", {
				message:
					"Only the network operator's organization can message dealers.",
			});
		}
		const dealer = await requireDealerInScope(scope, input.dealerId);

		const entry = await db.ispDealerAccount.findFirst({
			where: { id: input.entryId, dealerId: dealer.id },
			select: { id: true, whatsappNotice: true },
		});
		const notice = entry ? readDealerNotice(entry.whatsappNotice) : null;
		if (!entry || !notice) {
			throw new ORPCError("NOT_FOUND", {
				message: "This entry has no WhatsApp confirmation to send.",
			});
		}
		if (notice.status === "sent") {
			throw new ORPCError("BAD_REQUEST", {
				message: "The dealer was already sent this confirmation.",
			});
		}
		if (notice.status === "retrying") {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"This confirmation is still being retried. Check back in a minute.",
			});
		}

		const dealerNotice = await notifyDealerWhatsApp({
			dealerId: dealer.id,
			dealerAccountId: entry.id,
			params: notice.params,
			send: true,
		});
		return { dealerNotice };
	});
