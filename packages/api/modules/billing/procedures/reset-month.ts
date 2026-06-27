import { ORPCError } from "@orpc/server";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { notifyBadgeForOrganization } from "@repo/notifications";
import z from "zod";
import { adminProcedure } from "../../../orpc/procedures";
import { iradiusSetActive } from "../../customers/lib/iradius-api";
import { mirrorToIRadius } from "../../customers/lib/iradius-mirror";
import { VOID_REASON } from "../lib/invoice-void";

/**
 * Reset an unlocked billing month back to its "never opened" state.
 *
 * Use case: an org trials the system mid-cycle (a few in-app collections,
 * the rest done offline), then wants a clean start the following month. If
 * we lock the trial month its auto-generated unpaid invoices freeze into the
 * collector ledgers and corrupt the org's finances. Resetting wipes the
 * month's collection state so it can be re-opened (or locked away empty)
 * with no leftover debt.
 *
 * What it does, in order:
 *   1. Deletes every `payment` for the month. Approved-stop payments had
 *      flipped the customer INACTIVE in iRadius + locally — those are
 *      reactivated remote-first (mirror rule: remote success gates the local
 *      write, so a remote failure aborts with no drift), then deleted.
 *   2. Clears the month's `customer_invoice` rows:
 *        - mode "void"   → soft-delete (voidedAt set); kept for audit, hidden
 *                          from every billing view.
 *        - mode "delete" → hard-delete; rows gone entirely.
 *
 * Invoices are a purely local construct (never mirrored to iRadius), so
 * clearing them has no external side effects.
 *
 * Platform-admin only — org owners cannot run it. Refuses on a locked month.
 */
const RESET_CONFIRMATION = "RESET";

export const resetMonth = adminProcedure
	.route({
		method: "POST",
		path: "/billing/months/{billingMonthId}/reset",
		tags: ["Billing"],
		summary: "Reset an unlocked billing month to its never-opened state",
	})
	.input(
		z.object({
			organizationId: z.string(),
			billingMonthId: z.string(),
			mode: z.enum(["void", "delete"]),
			confirmation: z.literal(RESET_CONFIRMATION),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const month = await db.billingMonth.findFirst({
			where: {
				id: input.billingMonthId,
				organizationId: input.organizationId,
			},
		});
		if (!month) {
			throw new ORPCError("NOT_FOUND", {
				message: "Billing month not found",
			});
		}
		if (month.locked) {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Cannot reset a locked month. Unlock it first.",
			});
		}

		const org = await db.organization.findUnique({
			where: { id: input.organizationId },
			select: { iradiusDisabled: true },
		});
		const iradiusDisabled = org?.iradiusDisabled ?? false;

		// 1. Remove all payments for the month.
		const payments = await db.payment.findMany({
			where: {
				organizationId: input.organizationId,
				billingMonthId: input.billingMonthId,
			},
			select: {
				id: true,
				customerId: true,
				stoppedAccount: true,
				reviewedAt: true,
				customer: { select: { externalId: true } },
			},
		});

		let reactivated = 0;
		const plainPaymentIds: string[] = [];
		for (const payment of payments) {
			const isApprovedStop =
				payment.stoppedAccount && payment.reviewedAt !== null;
			if (!isApprovedStop) {
				plainPaymentIds.push(payment.id);
				continue;
			}
			// Reactivate in iRadius first; only on success delete the payment
			// and flip the customer back to ACTIVE locally.
			await mirrorToIRadius({
				iradiusDisabled,
				logTag: "iRadius reactivate on month reset",
				failureMessage:
					"Failed to reactivate a stopped customer in iRadius",
				remote: () => iradiusSetActive(payment.customer, true),
				local: () =>
					db.$transaction(async (tx) => {
						await tx.payment.delete({ where: { id: payment.id } });
						await tx.customer.update({
							where: { id: payment.customerId },
							data: { status: "ACTIVE" },
						});
					}),
			});
			reactivated += 1;
		}

		const deletedPlainPayments = plainPaymentIds.length
			? (
					await db.payment.deleteMany({
						where: { id: { in: plainPaymentIds } },
					})
				).count
			: 0;

		// 2. Clear the month's invoices per chosen mode.
		let voidedInvoices = 0;
		let deletedInvoices = 0;
		if (input.mode === "void") {
			const result = await db.customerInvoice.updateMany({
				where: {
					organizationId: input.organizationId,
					year: month.year,
					month: month.month,
					voidedAt: null,
				},
				data: {
					voidedAt: new Date(),
					voidedById: user.id,
					voidReason: VOID_REASON.ADMIN,
				},
			});
			voidedInvoices = result.count;
		} else {
			const result = await db.customerInvoice.deleteMany({
				where: {
					organizationId: input.organizationId,
					year: month.year,
					month: month.month,
				},
			});
			deletedInvoices = result.count;
		}

		const deletedPayments = deletedPlainPayments + reactivated;

		logger.info("[Billing] Month reset", {
			organizationId: input.organizationId,
			billingMonthId: input.billingMonthId,
			year: month.year,
			month: month.month,
			mode: input.mode,
			deletedPayments,
			reactivated,
			voidedInvoices,
			deletedInvoices,
		});

		notifyBadgeForOrganization(input.organizationId);

		return {
			year: month.year,
			month: month.month,
			mode: input.mode,
			deletedPayments,
			reactivated,
			voidedInvoices,
			deletedInvoices,
		};
	});
