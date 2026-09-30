import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	getDealerScopeViaCustomer,
	requirePermission,
	verifyCustomerOwnership,
} from "@repo/api/lib/permission";
import {
	billingAudit,
	customerAudit,
	getAuditContextFromHeaders,
} from "@repo/auth/lib/audit";
import { appendPaymentActivityLog, db } from "@repo/database";
import { notifyBadgeForOrganization } from "@repo/notifications";
import z from "zod";
import { toIRadiusDateTime } from "../../../lib/beirut-time";
import { protectedProcedure } from "../../../orpc/procedures";
import {
	calendarDays,
	type ExtraTimeContext,
	ExtraTimePastTargetError,
	extraTimeBase,
	iradiusAddExtraTime,
	iradiusReadExtraTimeContext,
	planExtraTime,
} from "../../customers/lib/iradius-extra-time";
import { mirrorToIRadius } from "../../customers/lib/iradius-mirror";
import { DealerCreditError } from "../../dealers/lib/iradius-dealer";
import { alignTarget, nextYearMonth, prorate } from "../lib/align-to-first";
import { customerMonthlyDue } from "../lib/calculations";
import {
	coverageKey,
	fetchCoverageMap,
	invoiceAmount,
	monthRemaining,
	monthSettled,
} from "../lib/settlement";

/**
 * "Align to 1st" — a customer paid for the days up to the 1st so their bill
 * comes out on the 1st from now on ("la tetla3 fatourta bi awal shaher").
 *
 *   1. iRadius, remote-first: move the expiry to the 1st 23:59 and charge the
 *      dealer the prorated wholesale Rate (`iradiusAddExtraTime`, the native
 *      "Add Day … Manage Dealer Credit" statements). Skipped when the expiry
 *      already sits on the 1st (the owner often does this part in iRadius).
 *   2. Locally: reprice that month's invoice to the prorated amount (the
 *      collector took "the difference", so the $25 invoice becomes $8 and
 *      the month settles), refresh the next month's frozen due date, and
 *      stamp the payment reviewed.
 *
 * This is the second sanctioned post-generation invoice rewrite, next to
 * `repriceAndReview`.
 */

const alignInput = z
	.object({
		organizationId: z.string(),
		paymentId: z.string().optional(),
		invoiceId: z.string().optional(),
		/** YYYY-MM-DD; defaults to the next 1st after the current expiry. */
		targetExpiry: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
			.optional(),
		/** Days the customer is billed for; defaults to the days added (or, when already aligned, payment date → target). */
		billableDays: z.number().int().min(0).max(62).optional(),
		/** Override of the suggested customer amount. */
		amount: z.number().finite().min(0).optional(),
		/** Only honoured for the wholesale operator's admins; everyone else always charges. */
		chargeDealer: z.boolean().optional(),
		markReviewed: z.boolean().optional(),
	})
	.refine((v) => (v.paymentId ? 1 : 0) + (v.invoiceId ? 1 : 0) === 1, {
		message: "Pass exactly one of paymentId or invoiceId",
	});

type AlignInput = z.infer<typeof alignInput>;

const customerSelect = {
	id: true,
	externalId: true,
	username: true,
	collectorId: true,
	expiresAt: true,
	monthlyRate: true,
	iptvPrice: true,
	realIpPrice: true,
	discount: true,
	plan: { select: { monthlyPrice: true } },
} as const;

const invoiceSelect = {
	id: true,
	customerId: true,
	year: true,
	month: true,
	total: true,
	tax: true,
	totalWithTax: true,
	note: true,
	voidedAt: true,
} as const;

/** Everything preview and apply both need, loaded and gated once. */
async function loadAlignment(input: AlignInput, userId: string) {
	const { activeDealerId, iradiusDisabled } = await requirePermission(
		input.organizationId,
		userId,
		"billing",
		"manage",
	);
	const { permCtx } = await requirePermission(
		input.organizationId,
		userId,
		"customers",
		"update",
	);

	let payment: {
		id: string;
		paidAmount: number;
		paidAt: Date;
		billingMonthId: string;
	} | null = null;
	let invoice: {
		id: string;
		customerId: string;
		year: number;
		month: number;
		total: number;
		tax: number;
		totalWithTax: number;
		note: string | null;
		voidedAt: Date | null;
	} | null;

	if (input.paymentId) {
		const row = await db.payment.findFirst({
			where: {
				id: input.paymentId,
				organizationId: input.organizationId,
				...getDealerScopeViaCustomer(activeDealerId),
			},
			select: {
				id: true,
				paidAmount: true,
				paidAt: true,
				billingMonthId: true,
				freeAccount: true,
				stoppedAccount: true,
				debtAccount: true,
				invoice: { select: invoiceSelect },
			},
		});
		if (!row) {
			throw new ORPCError("NOT_FOUND", { message: "Payment not found" });
		}
		if (row.stoppedAccount || row.freeAccount || row.debtAccount) {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"Only a cash collection can be aligned — stopped, free and debt rows have their own review.",
			});
		}
		payment = row;
		invoice = row.invoice;
	} else {
		invoice = await db.customerInvoice.findFirst({
			where: {
				// The input refine guarantees invoiceId when paymentId is absent.
				id: input.invoiceId ?? "",
				organizationId: input.organizationId,
				customer: getDealerScopeFilter(activeDealerId),
			},
			select: invoiceSelect,
		});
	}
	if (!invoice || invoice.voidedAt) {
		throw new ORPCError("BAD_REQUEST", {
			message:
				"This needs the month's invoice — create the invoice first, then prorate it.",
		});
	}

	const customer = await db.customer.findFirst({
		where: { id: invoice.customerId, organizationId: input.organizationId },
		select: customerSelect,
	});
	if (!customer) {
		throw new ORPCError("NOT_FOUND", { message: "Customer not found" });
	}
	await verifyCustomerOwnership(permCtx, "update", customer.collectorId);

	const useIRadius = !iradiusDisabled;
	if (useIRadius && !customer.externalId) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Customer is not linked to iRadius",
		});
	}

	const org = await db.organization.findUnique({
		where: { id: input.organizationId },
		select: { isWholesaleOperator: true },
	});
	const canToggleCharge = org?.isWholesaleOperator === true;
	const chargeDealer = canToggleCharge ? (input.chargeDealer ?? true) : true;

	const now = new Date();
	const ctx: ExtraTimeContext = useIRadius
		? await iradiusReadExtraTimeContext(customer.externalId)
		: {
				userId: 0,
				userName: customer.username ?? "",
				parentId: null,
				expiryLiteral: customer.expiresAt
					? toIRadiusDateTime(customer.expiresAt)
					: null,
				validityPeriod: 1,
				validityPeriodTypeId: 1,
				rate: 0,
				dealerCredit: null,
				noCharge: true,
			};
	const target = input.targetExpiry ?? alignTarget(extraTimeBase(ctx, now));
	const plan = planExtraTime(ctx, target, now);
	if (!plan.atTarget && plan.oldExpiry && plan.oldExpiry > plan.newExpiry) {
		throw new ORPCError("BAD_REQUEST", {
			message:
				"Expiry is already past the 1st; use Set billing expiry instead.",
		});
	}

	const alreadyAligned = plan.atTarget || plan.days <= 0;
	const billableDays =
		input.billableDays ??
		(alreadyAligned
			? Math.max(0, calendarDays(payment?.paidAt ?? now, target))
			: plan.days);
	const periodDays = plan.periodHours / 24;
	const monthlyDue = customerMonthlyDue(customer);
	const proration = prorate(
		monthlyDue,
		billableDays,
		periodDays,
		payment?.paidAmount,
	);

	const dealer =
		ctx.parentId !== null
			? await db.ispDealer.findUnique({
					where: { externalId: String(ctx.parentId) },
					select: { name: true, username: true },
				})
			: null;

	const next = nextYearMonth(invoice.year, invoice.month);
	const nextInvoice = await db.customerInvoice.findFirst({
		where: {
			organizationId: input.organizationId,
			customerId: customer.id,
			year: next.year,
			month: next.month,
			voidedAt: null,
		},
		select: { id: true, expiryDate: true, total: true, totalWithTax: true },
	});

	return {
		useIRadius,
		customer,
		payment,
		invoice,
		ctx,
		plan,
		target,
		alreadyAligned,
		billableDays,
		periodDays,
		monthlyDue,
		proration,
		chargeDealer,
		canToggleCharge,
		dealer,
		next,
		nextInvoice,
	};
}

export const alignToFirstPreview = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/payments/align-to-first/preview",
		tags: ["Billing"],
		summary:
			"Preview aligning a customer's expiry to the 1st: days, dealer charge and prorated invoice amount",
	})
	.input(alignInput)
	.handler(async ({ context: { user }, input }) => {
		const a = await loadAlignment(input, user.id);
		const dealerCharge =
			a.chargeDealer && !a.alreadyAligned ? a.plan.dealerCharge : 0;
		return {
			base: a.plan.base,
			currentExpiry: a.plan.oldExpiry,
			target: a.target,
			targetExpiry: a.plan.newExpiry,
			days: Math.max(0, a.plan.days),
			alreadyAligned: a.alreadyAligned,
			billableDays: a.billableDays,
			periodDays: a.periodDays,
			monthlyDue: a.monthlyDue,
			formulaAmount: a.proration.formulaAmount,
			suggestedAmount: a.proration.suggestedAmount,
			paidAmount: a.payment?.paidAmount ?? null,
			chargeDealer: a.chargeDealer,
			canToggleCharge: a.canToggleCharge,
			dealer: a.useIRadius
				? {
						name:
							a.dealer?.username ??
							a.dealer?.name ??
							(a.ctx.parentId ? `#${a.ctx.parentId}` : null),
						rate: a.ctx.rate,
						periodHours: a.plan.periodHours,
						charge: dealerCharge,
						wouldCharge: a.alreadyAligned ? 0 : a.plan.dealerCharge,
						credit: a.ctx.dealerCredit,
						noCharge: a.ctx.noCharge,
					}
				: null,
			invoice: {
				id: a.invoice.id,
				total: a.invoice.total,
				tax: a.invoice.tax,
				note: a.invoice.note,
			},
			nextInvoice: a.nextInvoice
				? { id: a.nextInvoice.id, expiryDate: a.nextInvoice.expiryDate }
				: null,
		};
	});

export const alignToFirst = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/payments/align-to-first",
		tags: ["Billing"],
		summary:
			"Align a customer's expiry to the 1st: charge the dealer the prorated days in iRadius and prorate the month's invoice",
	})
	.input(alignInput)
	.handler(async ({ context: { user, headers }, input }) => {
		const a = await loadAlignment(input, user.id);
		const { customer, payment, invoice, plan } = a;
		const amount = input.amount ?? a.proration.suggestedAmount;
		const markReviewed = input.markReviewed ?? !!payment;

		let dealerCharge = 0;
		const result = await mirrorToIRadius({
			iradiusDisabled: !a.useIRadius || plan.atTarget,
			logTag: "iRadius align-to-first",
			failureMessage: "Failed to move the expiry in iRadius",
			remote: async () => {
				try {
					const remote = await iradiusAddExtraTime({
						externalId: customer.externalId,
						targetExpiry: a.target,
						chargeDealer: a.chargeDealer,
						reason: "Aligned to 1st",
					});
					dealerCharge = remote.dealerCharge;
				} catch (error) {
					if (
						error instanceof DealerCreditError ||
						error instanceof ExtraTimePastTargetError
					) {
						throw new ORPCError("BAD_REQUEST", {
							message: error.message,
						});
					}
					throw error;
				}
			},
			local: () =>
				db.$transaction(async (tx) => {
					await tx.customer.update({
						where: { id: customer.id },
						data: { expiresAt: plan.newExpiry },
					});

					const formula = `${a.billableDays} day(s) × $${a.monthlyDue} / ${a.periodDays} = $${a.proration.formulaAmount}`;
					const line = `Prorated to 1st: ${formula} → $${amount} (was $${invoice.total})${dealerCharge > 0 ? `; dealer charged $${dealerCharge.toFixed(2)}` : ""}`;
					await tx.customerInvoice.update({
						where: { id: invoice.id },
						data: {
							total: amount,
							totalWithTax: amount + invoice.tax,
							note: invoice.note
								? `${invoice.note} · ${line}`
								: line,
						},
					});

					// The next month's invoice froze the old expiry; refresh it
					// unless it is already settled (its picture is closed).
					let nextInvoiceUpdated = false;
					if (a.nextInvoice) {
						const nextMonth = await tx.billingMonth.findUnique({
							where: {
								organizationId_year_month: {
									organizationId: input.organizationId,
									year: a.next.year,
									month: a.next.month,
								},
							},
							select: { id: true },
						});
						const nextCoverage = nextMonth
							? (
									await fetchCoverageMap(
										tx,
										input.organizationId,
										[nextMonth.id],
										[customer.id],
									)
								).get(coverageKey(customer.id, nextMonth.id))
							: undefined;
						if (
							!monthSettled(
								invoiceAmount(a.nextInvoice),
								nextCoverage,
							)
						) {
							await tx.customerInvoice.update({
								where: { id: a.nextInvoice.id },
								data: { expiryDate: plan.newExpiry },
							});
							nextInvoiceUpdated = true;
						}
					}

					if (payment) {
						if (markReviewed) {
							await tx.payment.update({
								where: { id: payment.id },
								data: { reviewedAt: new Date() },
							});
						}
						await appendPaymentActivityLog(
							[payment.id],
							{
								action: "aligned_to_first",
								status: "success",
								detail: `+${Math.max(0, plan.days)} days, dealer $${dealerCharge.toFixed(2)}, invoice $${invoice.total}→$${amount}`,
								timestamp: new Date().toISOString(),
							},
							{ client: tx },
						);
					}

					const billingMonthId =
						payment?.billingMonthId ??
						(
							await tx.billingMonth.findUnique({
								where: {
									organizationId_year_month: {
										organizationId: input.organizationId,
										year: invoice.year,
										month: invoice.month,
									},
								},
								select: { id: true },
							})
						)?.id;
					const coverage = billingMonthId
						? (
								await fetchCoverageMap(
									tx,
									input.organizationId,
									[billingMonthId],
									[customer.id],
								)
							).get(coverageKey(customer.id, billingMonthId))
						: undefined;
					return {
						nextInvoiceUpdated,
						remaining: monthRemaining(
							amount + invoice.tax,
							coverage,
						),
					};
				}),
		});

		const auditContext = getAuditContextFromHeaders(headers);
		customerAudit.updated(
			customer.id,
			user.id,
			input.organizationId,
			auditContext,
		);
		billingAudit.alignedToFirst(
			invoice.id,
			user.id,
			input.organizationId,
			auditContext,
			{
				customerId: customer.id,
				paymentId: payment?.id ?? null,
				days: Math.max(0, plan.days),
				billableDays: a.billableDays,
				dealerCharge,
				oldTotal: invoice.total,
				newTotal: amount,
				newExpiry: plan.newExpiryLiteral,
			},
		);
		notifyBadgeForOrganization(input.organizationId);

		return {
			days: Math.max(0, plan.days),
			dealerCharge,
			newExpiry: plan.newExpiry,
			invoiceTotal: amount,
			nextInvoiceUpdated: result.nextInvoiceUpdated,
			/** What the month still owes after proration — 0 when fully covered. */
			remaining: result.remaining,
		};
	});
