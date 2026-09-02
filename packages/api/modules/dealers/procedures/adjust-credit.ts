import { ORPCError } from "@orpc/server";
import { invalidateStat } from "@repo/api/lib/stat-cache";
import { dealerAudit, getAuditContextFromHeaders } from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { FINANCE_STAT_CACHE } from "../../finance/lib/cache";
import {
	DealerCreditError,
	iradiusAdjustDealerCredit,
} from "../lib/iradius-dealer";
import { buildLedgerComment } from "../lib/ledger";
import { requireDealerInScope, resolveDealerScope } from "../lib/scope";
import {
	acquireDealerWriteLock,
	releaseDealerWriteLock,
} from "../lib/write-guard";

/**
 * Add prepaid credit to a dealer, or take it back.
 *
 * Remote-first: iRadius is written inside one transaction and the local
 * mirror is updated only after it commits. If iRadius refuses (not enough
 * credit to deduct, tunnel down), nothing changes anywhere and the caller
 * gets the reason.
 */
export const adjustDealerCredit = protectedProcedure
	.route({
		method: "POST",
		path: "/dealers/finance/{dealerId}/credit",
		tags: ["Dealers"],
		summary: "Add or deduct a dealer's prepaid credit (writes to iRadius)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			dealerId: z.string(),
			direction: z.enum(["add", "deduct"]),
			amount: z.number().positive().max(1_000_000),
			note: z.string().trim().max(200).optional(),
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
					"Only the network operator's organization can change dealer credit.",
			});
		}
		if (scope.iradiusDisabled) {
			throw new ORPCError("BAD_REQUEST", {
				message: "iRadius is disabled for this organization.",
			});
		}

		const dealer = await requireDealerInScope(scope, input.dealerId);
		if (dealer.deletedAt) {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"This dealer no longer exists in iRadius. Its balance can only be written off.",
			});
		}

		const note = input.note?.trim() || null;
		const ledgerComment =
			input.direction === "add"
				? note
				: buildLedgerComment("deduction", note);

		const lock = await acquireDealerWriteLock({
			dealerId: dealer.id,
			side: input.direction === "add" ? "credit" : "debit",
			amount: input.amount,
		});

		let remote: Awaited<ReturnType<typeof iradiusAdjustDealerCredit>>;
		try {
			remote = await iradiusAdjustDealerCredit(dealer, {
				amount: input.amount,
				direction: input.direction,
				note,
				ledgerComment,
			});
		} catch (error) {
			await releaseDealerWriteLock(lock);
			if (error instanceof DealerCreditError) {
				throw new ORPCError("BAD_REQUEST", { message: error.message });
			}
			logger.error("[dealers] iRadius credit adjustment failed", {
				dealerId: dealer.id,
				error,
			});
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message:
					"iRadius did not accept the change. Nothing was recorded — try again in a moment.",
			});
		}

		// Mirror locally. The ledger row carries the iRadius id so the next
		// sync recognises it as already imported.
		await db.$transaction([
			db.ispDealer.update({
				where: { id: dealer.id },
				data: { credit: remote.finalCredit },
			}),
			db.ispDealerAccount.create({
				data: {
					dealerId: dealer.id,
					organizationId: scope.organizationId,
					externalId: String(remote.accountEntryId),
					credit: input.direction === "add" ? input.amount : 0,
					debit: input.direction === "deduct" ? input.amount : 0,
					balance: remote.owed,
					comment: ledgerComment,
					operationDate: remote.operationDate,
				},
			}),
		]);

		dealerAudit.creditAdjusted(
			dealer.id,
			user.id,
			scope.organizationId,
			getAuditContextFromHeaders(headers),
			{
				dealerName: dealer.name,
				direction: input.direction,
				amount: input.amount,
				finalCredit: remote.finalCredit,
				note,
				iradiusAccountEntryId: remote.accountEntryId,
			},
		);

		void invalidateStat(FINANCE_STAT_CACHE.summary, [scope.organizationId]);

		return {
			prepaid: remote.finalCredit,
			owed: remote.owed,
		};
	});
