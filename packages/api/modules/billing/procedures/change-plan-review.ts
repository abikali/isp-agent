import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	getDealerScopeViaCustomer,
	requirePermission,
	verifyCustomerOwnership,
} from "@repo/api/lib/permission";
import {
	customerAudit,
	getAuditContextFromHeaders,
} from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { notifyBadgeForOrganization } from "@repo/notifications";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { executeAccountTypeChange } from "../../customers/lib/iradius-api";
import { mirrorToIRadius } from "../../customers/lib/iradius-mirror";
import { planMonthlyRate } from "../../customers/lib/plan-rate";
import { customerMonthlyDue } from "../lib/calculations";
import {
	coverageKey,
	fetchCoverageMap,
	monthRemaining,
} from "../lib/settlement";

/**
 * Review action for a collection whose amount reflects a plan change the
 * customer asked for at the door (note category DOWNGRADE / UPGRADE): the
 * collector took the NEW plan's price, so the row reads as under/overpaid
 * against the old one and the month stays short in every receivable view.
 *
 * Marking it reviewed alone would leave the $15 "remainder" in the
 * collection analytics and on the collect list; this does what the review
 * actually means:
 *
 *   1. moves the customer to the new plan in iRadius FIRST (remote-first,
 *      same call the customer-detail "Change plan" uses), then locally;
 *   2. reprices this payment's `accountPrice` and its month's frozen invoice
 *      to the new plan, so the collection is recorded as full against the
 *      plan the customer is now on;
 *   3. stamps `reviewedAt`.
 *
 * Only cash collections qualify — stopped / free / debt rows carry their own
 * review flows. If the customer was already moved to the plan (an admin used
 * "Change plan" first) the remote call is skipped and only the repricing +
 * review run, so the action is safe to apply after the fact.
 */
export const changePlanAndReviewPayment = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/payments/change-plan-and-review",
		tags: ["Billing"],
		summary:
			"Move the customer to a new plan, reprice this payment's month to it, and mark the payment reviewed",
	})
	.input(
		z.object({
			organizationId: z.string(),
			paymentId: z.string(),
			newPlanId: z.string(),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const { activeDealerId, iradiusDisabled } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);
		// The plan move is a customer mutation — same gate as "Change plan".
		const { permCtx } = await requirePermission(
			input.organizationId,
			user.id,
			"customers",
			"update",
		);

		const payment = await db.payment.findFirst({
			where: {
				id: input.paymentId,
				organizationId: input.organizationId,
				...getDealerScopeViaCustomer(activeDealerId),
			},
			select: {
				id: true,
				billingMonthId: true,
				freeAccount: true,
				stoppedAccount: true,
				debtAccount: true,
				activityLog: true,
				customer: {
					select: {
						id: true,
						externalId: true,
						username: true,
						planId: true,
						collectorId: true,
						iptvPrice: true,
						realIpPrice: true,
						discount: true,
					},
				},
				invoice: { select: { id: true, tax: true, voidedAt: true } },
			},
		});
		if (!payment) {
			throw new ORPCError("NOT_FOUND", { message: "Payment not found" });
		}
		if (
			payment.stoppedAccount ||
			payment.freeAccount ||
			payment.debtAccount
		) {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"Only a cash collection can be repriced to a new plan — stopped, free and debt rows have their own review.",
			});
		}

		await verifyCustomerOwnership(
			permCtx,
			"update",
			payment.customer.collectorId,
		);

		const newPlan = await db.servicePlan.findFirst({
			where: {
				id: input.newPlanId,
				organizationId: input.organizationId,
				...getDealerScopeFilter(activeDealerId),
			},
			select: {
				id: true,
				name: true,
				externalId: true,
				sellingPrice: true,
				rate: true,
				monthlyPrice: true,
			},
		});
		if (!newPlan) {
			throw new ORPCError("NOT_FOUND", { message: "Plan not found" });
		}
		if (!iradiusDisabled && !newPlan.externalId) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Plan not linked to iRadius",
			});
		}
		if (!iradiusDisabled && !payment.customer.externalId) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Customer not linked to iRadius",
			});
		}

		const newMonthlyRate = planMonthlyRate(newPlan);
		const newInvoiceTotal = Math.max(
			0,
			customerMonthlyDue({
				monthlyRate: newMonthlyRate,
				iptvPrice: payment.customer.iptvPrice,
				realIpPrice: payment.customer.realIpPrice,
				discount: payment.customer.discount,
			}),
		);
		const alreadyOnPlan = payment.customer.planId === newPlan.id;
		const previousLog = Array.isArray(payment.activityLog)
			? (payment.activityLog as unknown[])
			: [];

		let disconnected = false;
		const result = await mirrorToIRadius({
			// Nothing to push when the customer already sits on the plan.
			iradiusDisabled: (iradiusDisabled ?? false) || alreadyOnPlan,
			logTag: "iRadius change account type on review-payment",
			failureMessage: "Failed to change plan in iRadius",
			remote: async () => {
				try {
					const changed = await executeAccountTypeChange(
						payment.customer,
						Number.parseInt(newPlan.externalId as string, 10),
					);
					disconnected = changed.disconnected;
				} catch (error) {
					// Local planId lagged behind iRadius (already moved there,
					// e.g. via the legacy UI). The customer IS on the plan, which
					// is all this action needs — carry on with the repricing.
					const message =
						error instanceof Error ? error.message : String(error);
					if (!/already on this account type/i.test(message)) {
						throw error;
					}
					logger.info(
						"iRadius already on target account type; repricing only",
						{ customerId: payment.customer.id, planId: newPlan.id },
					);
				}
			},
			local: () =>
				db.$transaction(async (tx) => {
					await tx.customer.update({
						where: { id: payment.customer.id },
						data: {
							planId: newPlan.id,
							monthlyRate: newMonthlyRate,
						},
					});
					await tx.payment.update({
						where: { id: payment.id },
						data: {
							accountPrice: newMonthlyRate,
							reviewedAt: new Date(),
							activityLog: [
								...previousLog,
								{
									action: "plan_changed",
									status: "success",
									detail: `Repriced to ${newPlan.name} (${newMonthlyRate}) on review`,
									timestamp: new Date().toISOString(),
								},
							] as object[],
						},
					});
					let invoiceRepriced = false;
					if (payment.invoice && !payment.invoice.voidedAt) {
						await tx.customerInvoice.update({
							where: { id: payment.invoice.id },
							data: {
								accountPrice: newMonthlyRate,
								total: newInvoiceTotal,
								totalWithTax:
									newInvoiceTotal + payment.invoice.tax,
							},
						});
						invoiceRepriced = true;
					}
					const coverage = await fetchCoverageMap(
						tx,
						input.organizationId,
						[payment.billingMonthId],
						[payment.customer.id],
					);
					const remaining = monthRemaining(
						newInvoiceTotal + (payment.invoice?.tax ?? 0),
						coverage.get(
							coverageKey(
								payment.customer.id,
								payment.billingMonthId,
							),
						),
					);
					return { invoiceRepriced, remaining };
				}),
		});

		customerAudit.updated(
			payment.customer.id,
			user.id,
			input.organizationId,
			getAuditContextFromHeaders(headers),
		);
		notifyBadgeForOrganization(input.organizationId);

		return {
			planChanged: !alreadyOnPlan,
			disconnected,
			newPlan: { id: newPlan.id, name: newPlan.name },
			accountPrice: newMonthlyRate,
			invoiceTotal: newInvoiceTotal,
			invoiceRepriced: result.invoiceRepriced,
			/** What the month still owes after repricing — 0 when fully covered. */
			remaining: result.remaining,
		};
	});
