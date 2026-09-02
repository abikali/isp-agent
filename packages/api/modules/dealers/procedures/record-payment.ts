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
	iradiusRecordDealerPayment,
} from "../lib/iradius-dealer";
import { buildLedgerComment } from "../lib/ledger";
import { requireDealerInScope, resolveDealerScope } from "../lib/scope";

/**
 * Money coming back from a dealer: cash handed over, a balance forgiven, or
 * goods accepted instead of cash. Lowers what the dealer owes; never touches
 * their prepaid credit (that is what `adjustCredit` is for).
 *
 * Paying more than is owed is allowed — it is an advance, and the dealer
 * simply goes into credit with the operator. The UI warns; the API does not
 * refuse.
 */
export const recordDealerPayment = protectedProcedure
	.route({
		method: "POST",
		path: "/dealers/finance/{dealerId}/payment",
		tags: ["Dealers"],
		summary:
			"Record a payment, write-off or in-kind settlement from a dealer",
	})
	.input(
		z.object({
			organizationId: z.string(),
			dealerId: z.string(),
			kind: z.enum(["payment", "write_off", "in_kind", "adjustment"]),
			amount: z.number().positive().max(1_000_000),
			/** When the money actually changed hands. Defaults to now. */
			date: z.coerce.date().optional(),
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
					"Only the network operator's organization can record dealer payments.",
			});
		}
		if (scope.iradiusDisabled) {
			throw new ORPCError("BAD_REQUEST", {
				message: "iRadius is disabled for this organization.",
			});
		}

		const operationDate = input.date ?? new Date();
		if (operationDate.getTime() > Date.now() + 5 * 60 * 1000) {
			throw new ORPCError("BAD_REQUEST", {
				message: "The payment date cannot be in the future.",
			});
		}

		const dealer = await requireDealerInScope(scope, input.dealerId);
		if (dealer.deletedAt && input.kind !== "write_off") {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"This dealer no longer exists in iRadius. Its balance can only be written off.",
			});
		}

		const comment = buildLedgerComment(input.kind, input.note);

		let remote: Awaited<ReturnType<typeof iradiusRecordDealerPayment>>;
		try {
			remote = await iradiusRecordDealerPayment(dealer, {
				amount: input.amount,
				operationDate,
				comment,
			});
		} catch (error) {
			if (error instanceof DealerCreditError) {
				throw new ORPCError("BAD_REQUEST", { message: error.message });
			}
			logger.error("[dealers] iRadius payment record failed", {
				dealerId: dealer.id,
				error,
			});
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message:
					"iRadius did not accept the entry. Nothing was recorded — try again in a moment.",
			});
		}

		await db.ispDealerAccount.create({
			data: {
				dealerId: dealer.id,
				organizationId: scope.organizationId,
				externalId: String(remote.accountEntryId),
				credit: 0,
				debit: input.amount,
				balance: remote.owed,
				comment,
				operationDate,
			},
		});

		dealerAudit.paymentRecorded(
			dealer.id,
			user.id,
			scope.organizationId,
			getAuditContextFromHeaders(headers),
			{
				dealerName: dealer.name,
				kind: input.kind,
				amount: input.amount,
				owedAfter: remote.owed,
				note: input.note?.trim() || null,
				iradiusAccountEntryId: remote.accountEntryId,
			},
		);

		void invalidateStat(FINANCE_STAT_CACHE.summary, [scope.organizationId]);

		return { owed: remote.owed };
	});
