import { ORPCError } from "@orpc/server";
import {
	getDealerScopeViaCustomer,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { notifyBadgeForOrganization } from "@repo/notifications";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import {
	IRadiusUserNotFoundError,
	iradiusSetActive,
} from "../../customers/lib/iradius-api";
import { mirrorToIRadius } from "../../customers/lib/iradius-mirror";
import { VOID_REASON, voidInvoice } from "../lib/invoice-void";
import { closeReviewTasksForCustomer } from "../lib/review-tasks";

export const reviewPayment = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/payments/review",
		tags: ["Billing"],
		summary: "Mark a flagged payment as reviewed",
	})
	.input(
		z.object({
			organizationId: z.string(),
			paymentId: z.string(),
			// Set after the operator confirms (via the client prompt) that the
			// iRadius user is already gone: forgives the "user not found"
			// remote error and still records the local deactivation.
			force: z.boolean().optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId, iradiusDisabled } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);

		const payment = await db.payment.findFirst({
			where: {
				id: input.paymentId,
				organizationId: input.organizationId,
				...getDealerScopeViaCustomer(activeDealerId),
			},
			select: {
				id: true,
				reviewedAt: true,
				stoppedAccount: true,
				customerId: true,
				invoiceId: true,
				customer: {
					select: { externalId: true, username: true },
				},
			},
		});

		if (!payment) {
			throw new ORPCError("NOT_FOUND", {
				message: "Payment not found",
			});
		}

		// Deactivate in iRadius FIRST when approving a stopped payment.
		// If that fails the local review + status change never run.
		const runLocal = () =>
			db.$transaction(async (tx) => {
				await tx.payment.update({
					where: { id: input.paymentId },
					data: { reviewedAt: new Date() },
				});
				if (payment.stoppedAccount) {
					await tx.customer.update({
						where: { id: payment.customerId },
						data: { status: "INACTIVE" },
					});
					// Void the invoice this stop replaces — the customer is
					// no longer on the hook for this month. Keeps a full audit
					// trail (row stays; voidedAt + voidedById flag the write).
					if (payment.invoiceId) {
						await voidInvoice(
							tx,
							payment.invoiceId,
							user.id,
							VOID_REASON.STOPPED,
						);
					}
				}
			});

		if (payment.stoppedAccount) {
			await mirrorToIRadius({
				iradiusDisabled,
				logTag: "iRadius deactivate on review-payment",
				failureMessage: "Failed to deactivate customer in iRadius",
				remote: async () => {
					try {
						// `force` is set once the operator confirms via the
						// client prompt that the iRadius user is already gone;
						// it forgives the "user not found" error and lets the
						// local deactivation proceed.
						await iradiusSetActive(payment.customer, false, {
							tolerateMissing: input.force === true,
						});
					} catch (error) {
						// Not forced yet: surface a distinct code so the client
						// can prompt the operator instead of showing a raw 500.
						if (error instanceof IRadiusUserNotFoundError) {
							throw new ORPCError("IRADIUS_USER_MISSING", {
								status: 409,
								message:
									"This customer no longer exists in iRadius — it may have been deleted there directly.",
							});
						}
						throw error;
					}
				},
				local: runLocal,
			});
			await closeReviewTasksForCustomer(
				input.organizationId,
				payment.customerId,
			);
		} else {
			await runLocal();
		}

		notifyBadgeForOrganization(input.organizationId);

		return { success: true };
	});
