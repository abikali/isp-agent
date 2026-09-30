import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { billingAudit, getAuditContextFromHeaders } from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import { notifyBadgeForOrganization } from "@repo/notifications";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import {
	applyOneTimeDiscount,
	OneTimeDiscountError,
} from "../lib/one-time-discount";

/**
 * "This month only" discount on an invoice, before (or without) a
 * collection. Local-only: iRadius has no one-time discount and the customer's
 * recurring discount stays as it is. See `lib/one-time-discount.ts`.
 */
export const applyOneTimeDiscountProcedure = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/invoices/{invoiceId}/one-time-discount",
		tags: ["Billing"],
		summary: "Discount one invoice for this month only",
	})
	.input(
		z.object({
			organizationId: z.string(),
			invoiceId: z.string(),
			amount: z.number().finite().positive(),
			reason: z.string().trim().min(1).max(200),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);

		const existing = await db.customerInvoice.findFirst({
			where: {
				id: input.invoiceId,
				organizationId: input.organizationId,
				customer: getDealerScopeFilter(activeDealerId),
			},
			select: { id: true, customerId: true },
		});
		if (!existing) {
			throw new ORPCError("NOT_FOUND", { message: "Invoice not found" });
		}

		let result: Awaited<ReturnType<typeof applyOneTimeDiscount>>;
		try {
			result = await db.$transaction((tx) =>
				applyOneTimeDiscount(tx, {
					invoiceId: existing.id,
					amount: input.amount,
					reason: input.reason,
					userName: user.name,
				}),
			);
		} catch (error) {
			if (error instanceof OneTimeDiscountError) {
				throw new ORPCError("BAD_REQUEST", { message: error.message });
			}
			throw error;
		}

		billingAudit.oneTimeDiscount(
			existing.id,
			user.id,
			input.organizationId,
			getAuditContextFromHeaders(headers),
			{
				customerId: existing.customerId,
				paymentId: null,
				amount: input.amount,
				reason: input.reason,
				oldTotal: result.oldTotal,
				newTotal: result.total,
			},
		);
		notifyBadgeForOrganization(input.organizationId);

		return result;
	});
