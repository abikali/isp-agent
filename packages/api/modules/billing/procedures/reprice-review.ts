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
import {
	diffMirrorFields,
	pushMirrorDiffToIRadius,
} from "../../customers/lib/mirror-fields";
import { planMonthlyRate } from "../../customers/lib/plan-rate";
import { customerMonthlyDue } from "../lib/calculations";
import {
	coverageKey,
	fetchCoverageMap,
	monthRemaining,
} from "../lib/settlement";

/**
 * Review action for a cash collection whose amount reflects a pricing change
 * agreed at the door — a plan move (note DOWNGRADE / UPGRADE), a discount, or
 * an add-on (IPTV / Real IP) the customer dropped or took. The collector took
 * the NEW price, so the row reads as under/overpaid against the frozen
 * invoice and the month stays short in every receivable view.
 *
 * Marking it reviewed alone (or only setting the customer's future discount)
 * leaves the "remainder" on the collect list and on the customer's receipt;
 * this does what the review actually means:
 *
 *   1. applies the pricing to the customer in iRadius FIRST (remote-first:
 *      account-type change, then the recurring discount / add-on prices via
 *      the shared mirror diff), then locally;
 *   2. reprices this payment and its month's frozen invoice to the new
 *      pricing, so the collection is recorded as full against what the
 *      customer now pays;
 *   3. stamps `reviewedAt`.
 *
 * Only cash collections qualify — stopped / free / debt rows carry their own
 * review flows. Every field is optional so an admin can change just the
 * discount, just the plan, or several at once; unchanged fields push nothing
 * to iRadius, so the action is safe to re-apply after the fact.
 */
export const repriceAndReviewPayment = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/payments/reprice-and-review",
		tags: ["Billing"],
		summary:
			"Apply new pricing (plan, discount, add-ons) to the customer, reprice this payment's month to it, and mark the payment reviewed",
	})
	// Every pricing field is optional, and so is changing anything at all:
	// when the customer was already moved to the agreed pricing before the
	// collection (plan edited mid-month, after the invoice froze), the
	// invoice is the only thing left to reprice, and that is what a call
	// with no fields does — nothing is pushed to iRadius.
	.input(
		z.object({
			organizationId: z.string(),
			paymentId: z.string(),
			newPlanId: z.string().optional(),
			discount: z.number().finite().min(0).optional(),
			iptvPrice: z.number().finite().min(0).optional(),
			realIpPrice: z.number().finite().min(0).optional(),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const { activeDealerId, iradiusDisabled } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);
		// The pricing change is a customer mutation — same gate as editing
		// the customer.
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
				accountPrice: true,
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
						monthlyRate: true,
						plan: { select: { monthlyPrice: true } },
						iptvPrice: true,
						realIpPrice: true,
						discount: true,
						// Personal fields the mirror diff reads; none of them
						// change here, they only satisfy its input shape.
						firstName: true,
						lastName: true,
						email: true,
						address: true,
						phones: true,
						groupExternalId: true,
						collectorId: true,
						latitude: true,
						longitude: true,
						notes: true,
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
					"Only a cash collection can be repriced — stopped, free and debt rows have their own review.",
			});
		}

		await verifyCustomerOwnership(
			permCtx,
			"update",
			payment.customer.collectorId,
		);

		const { customer } = payment;
		const linked = !!customer.externalId;

		// --- Plan -----------------------------------------------------------
		const targetPlanId =
			input.newPlanId !== undefined && input.newPlanId !== customer.planId
				? input.newPlanId
				: null;
		const newPlan = targetPlanId
			? await db.servicePlan.findFirst({
					where: {
						id: targetPlanId,
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
				})
			: null;
		if (targetPlanId && !newPlan) {
			throw new ORPCError("NOT_FOUND", { message: "Plan not found" });
		}
		if (newPlan && !iradiusDisabled) {
			if (!newPlan.externalId) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Plan not linked to iRadius",
				});
			}
			if (!linked) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Customer not linked to iRadius",
				});
			}
		}

		// --- Pricing --------------------------------------------------------
		const newMonthlyRate = newPlan
			? planMonthlyRate(newPlan)
			: (customer.monthlyRate ??
				customer.plan?.monthlyPrice ??
				payment.accountPrice);
		const next = {
			discount: input.discount ?? customer.discount,
			iptvPrice: input.iptvPrice ?? customer.iptvPrice,
			realIpPrice: input.realIpPrice ?? customer.realIpPrice,
		};
		const newInvoiceTotal = Math.max(
			0,
			customerMonthlyDue({ monthlyRate: newMonthlyRate, ...next }),
		);
		const diff = diffMirrorFields(customer, next);
		const pushExtras =
			linked &&
			(diff.discountChanged ||
				diff.iptvPriceChanged ||
				diff.realIpPriceChanged);
		const previousLog = Array.isArray(payment.activityLog)
			? (payment.activityLog as unknown[])
			: [];

		let disconnected = false;
		const result = await mirrorToIRadius({
			// Nothing to push when neither the plan nor the extras move.
			iradiusDisabled:
				(iradiusDisabled ?? false) || (!newPlan && !pushExtras),
			logTag: "iRadius reprice on review-payment",
			failureMessage: "Failed to apply the new pricing in iRadius",
			remote: async () => {
				if (newPlan) {
					try {
						const changed = await executeAccountTypeChange(
							customer,
							Number.parseInt(newPlan.externalId as string, 10),
						);
						disconnected = changed.disconnected;
					} catch (error) {
						// Local planId lagged behind iRadius (already moved
						// there, e.g. via the legacy UI). The customer IS on the
						// plan, which is all this action needs — carry on.
						const message =
							error instanceof Error
								? error.message
								: String(error);
						if (!/already on this account type/i.test(message)) {
							throw error;
						}
						logger.info(
							"iRadius already on target account type; repricing only",
							{ customerId: customer.id, planId: newPlan.id },
						);
					}
				}
				if (pushExtras) {
					await pushMirrorDiffToIRadius({
						externalId: customer.externalId as string,
						diff,
						next,
						existing: customer,
					});
				}
			},
			local: () =>
				db.$transaction(async (tx) => {
					await tx.customer.update({
						where: { id: customer.id },
						data: {
							...(newPlan
								? {
										planId: newPlan.id,
										monthlyRate: newMonthlyRate,
									}
								: {}),
							...next,
						},
					});
					const changes = [
						newPlan
							? `plan ${newPlan.name} (${newMonthlyRate})`
							: null,
						diff.discountChanged
							? `discount ${next.discount}`
							: null,
						diff.iptvPriceChanged ? `IPTV ${next.iptvPrice}` : null,
						diff.realIpPriceChanged
							? `Real IP ${next.realIpPrice}`
							: null,
					].filter(Boolean);
					await tx.payment.update({
						where: { id: payment.id },
						data: {
							accountPrice: newMonthlyRate,
							// The sheet stamps the customer's standing discount on
							// the row at collection time; a discount applied on
							// review is recorded the same way so the row reads as
							// full against the new price.
							discount: next.discount,
							reviewedAt: new Date(),
							activityLog: [
								...previousLog,
								{
									action: "repriced",
									status: "success",
									detail: `Repriced on review: ${changes.join(", ") || "no change"} → ${newInvoiceTotal}`,
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
								...next,
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
						[customer.id],
					);
					const remaining = monthRemaining(
						newInvoiceTotal + (payment.invoice?.tax ?? 0),
						coverage.get(
							coverageKey(customer.id, payment.billingMonthId),
						),
					);
					return { invoiceRepriced, remaining };
				}),
		});

		customerAudit.updated(
			customer.id,
			user.id,
			input.organizationId,
			getAuditContextFromHeaders(headers),
		);
		notifyBadgeForOrganization(input.organizationId);

		return {
			planChanged: !!newPlan,
			disconnected,
			newPlan: newPlan ? { id: newPlan.id, name: newPlan.name } : null,
			accountPrice: newMonthlyRate,
			...next,
			invoiceTotal: newInvoiceTotal,
			invoiceRepriced: result.invoiceRepriced,
			/** What the month still owes after repricing — 0 when fully covered. */
			remaining: result.remaining,
		};
	});
