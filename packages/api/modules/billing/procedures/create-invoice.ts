import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { mirrorToIRadius } from "../../customers/lib/iradius-mirror";
import { reactivateInIRadius } from "../../customers/lib/reactivate-in-iradius";
import { frozenInvoiceExpiry, getMonthDateRange } from "../lib/resolve-month";

/**
 * Manually create a customer_invoice row. Normally invoices are generated
 * at billing-month open; this covers edge cases (mid-month activation,
 * reactivations, adjustments) that the automated flow misses.
 */
export const createInvoice = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/invoices",
		tags: ["Billing"],
		summary: "Manually create an invoice",
	})
	.input(
		z.object({
			organizationId: z.string(),
			customerId: z.string(),
			year: z.number().int().min(2000).max(3000),
			month: z.number().int().min(1).max(12),
			accountPrice: z.number().finite().min(0).optional(),
			iptvPrice: z.number().finite().min(0).optional(),
			realIpPrice: z.number().finite().min(0).optional(),
			total: z.number().finite().min(0).optional(),
			discount: z.number().finite().min(0).default(0),
			tax: z.number().finite().min(0).default(0),
			totalWithTax: z.number().finite().min(0).optional(),
			expiryDate: z.string().optional(),
			note: z.string().optional(),
			/**
			 * Renew the (expired) customer one period in iRadius first —
			 * charges the dealer — and freeze the renewed expiry on the invoice.
			 */
			renewInIRadius: z.boolean().optional(),
			/** With `renewInIRadius`: also re-enable an inactive customer. */
			activate: z.boolean().optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId, iradiusDisabled } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);

		const customer = await db.customer.findFirst({
			where: {
				id: input.customerId,
				organizationId: input.organizationId,
				...getDealerScopeFilter(activeDealerId),
			},
			select: {
				id: true,
				expiresAt: true,
				externalId: true,
				status: true,
			},
		});
		if (!customer) {
			throw new ORPCError("NOT_FOUND", { message: "Customer not found" });
		}

		const existing = await db.customerInvoice.findUnique({
			where: {
				organizationId_customerId_year_month: {
					organizationId: input.organizationId,
					customerId: input.customerId,
					year: input.year,
					month: input.month,
				},
			},
			select: { id: true },
		});
		if (existing) {
			throw new ORPCError("CONFLICT", {
				message: `Invoice for ${String(input.month).padStart(2, "0")}/${input.year} already exists for this customer`,
			});
		}

		const range = getMonthDateRange(input.year, input.month);
		const hasLineItems =
			input.accountPrice !== undefined ||
			input.iptvPrice !== undefined ||
			input.realIpPrice !== undefined;
		if (input.total === undefined && !hasLineItems) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Provide either total or line-item amounts",
			});
		}
		const lineItemTotal =
			(input.accountPrice ?? 0) +
			(input.iptvPrice ?? 0) +
			(input.realIpPrice ?? 0) -
			input.discount;
		const total = input.total ?? Math.max(0, lineItemTotal);
		const totalWithTax = input.totalWithTax ?? total + input.tax;
		// The expiry is clamped like the generator: a date (explicit, live or
		// renewed) earlier than the month start is lifted to it; a later one
		// is kept as-is.
		const invoiceData = (fallbackExpiry: Date | null) => ({
			organizationId: input.organizationId,
			customerId: input.customerId,
			year: input.year,
			month: input.month,
			invoiceDate: range.gte,
			expiryDate: frozenInvoiceExpiry(
				input.expiryDate ? new Date(input.expiryDate) : fallbackExpiry,
				range,
			),
			accountPrice: input.accountPrice ?? null,
			iptvPrice: input.iptvPrice ?? null,
			realIpPrice: input.realIpPrice ?? null,
			total,
			discount: input.discount,
			tax: input.tax,
			totalWithTax,
			note: input.note ?? null,
		});

		if (!input.renewInIRadius) {
			const invoice = await db.customerInvoice.create({
				data: invoiceData(customer.expiresAt),
			});
			return { invoice };
		}

		// Renew in iRadius first — after the duplicate-month CONFLICT above,
		// so a duplicate invoice never triggers a charge — then write the
		// expiry iRadius now holds, the status and the invoice in one
		// transaction. The invoice freezes the renewed expiry.
		if (iradiusDisabled || !customer.externalId) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Renew on iRadius needs a customer linked to iRadius",
			});
		}
		const activate =
			input.activate === true && customer.status !== "ACTIVE";
		let renewedExpiry: Date | null = null;
		const invoice = await mirrorToIRadius({
			logTag: "iRadius renew on create-invoice",
			failureMessage: "Failed to renew the customer in iRadius",
			remote: async () => {
				({ expiresAt: renewedExpiry } = await reactivateInIRadius({
					customer,
					activate,
					renew: true,
					customExpiryDate: null,
					reason: "Renewed on invoice creation",
				}));
			},
			local: () =>
				db.$transaction(async (tx) => {
					await tx.customer.update({
						where: { id: customer.id },
						data: {
							...(renewedExpiry
								? { expiresAt: renewedExpiry }
								: {}),
							...(activate ? { status: "ACTIVE" as const } : {}),
						},
					});
					return tx.customerInvoice.create({
						data: invoiceData(renewedExpiry ?? customer.expiresAt),
					});
				}),
		});

		return { invoice };
	});
