import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { SETTLED_PAYMENT } from "../lib/filters";
import { unvoidInvoice, VOID_REASON, voidInvoice } from "../lib/invoice-void";
import { fetchRelevantBillingMonths } from "../lib/queries";
import { resolveYearMonth } from "../lib/resolve-month";

/**
 * Admin void / unvoid for an invoice. Voided invoices stay in the table
 * for audit but are filtered out of every billing view via NOT_VOIDED.
 */

const input = z.object({
	organizationId: z.string(),
	invoiceId: z.string(),
});

async function loadOrgInvoice(
	organizationId: string,
	invoiceId: string,
	activeDealerId: string | null,
) {
	const invoice = await db.customerInvoice.findFirst({
		where: {
			id: invoiceId,
			organizationId,
			customer: getDealerScopeFilter(activeDealerId),
		},
		select: { id: true, voidedAt: true },
	});
	if (!invoice) {
		throw new ORPCError("NOT_FOUND", { message: "Invoice not found" });
	}
	return invoice;
}

export const voidInvoiceProcedure = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/invoices/{invoiceId}/void",
		tags: ["Billing"],
		summary: "Void an invoice",
	})
	.input(input)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);
		const existing = await loadOrgInvoice(
			input.organizationId,
			input.invoiceId,
			activeDealerId,
		);
		if (existing.voidedAt) {
			throw new ORPCError("CONFLICT", {
				message: "Invoice is already voided",
			});
		}
		const invoice = await voidInvoice(
			db,
			input.invoiceId,
			user.id,
			VOID_REASON.ADMIN,
		);
		return { invoice };
	});

export const voidManyInvoicesProcedure = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/invoices/void-many",
		tags: ["Billing"],
		summary: "Void multiple invoices",
	})
	.input(
		z.object({
			organizationId: z.string(),
			invoiceIds: z.array(z.string()).min(1).max(500),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);
		const matching = await db.customerInvoice.findMany({
			where: {
				id: { in: input.invoiceIds },
				organizationId: input.organizationId,
				voidedAt: null,
				customer: getDealerScopeFilter(activeDealerId),
			},
			select: { id: true },
		});
		if (matching.length === 0) {
			return { count: 0, requested: input.invoiceIds.length };
		}
		const result = await db.customerInvoice.updateMany({
			where: { id: { in: matching.map((i) => i.id) } },
			data: {
				voidedAt: new Date(),
				voidedById: user.id,
				voidReason: VOID_REASON.ADMIN,
			},
		});
		return { count: result.count, requested: input.invoiceIds.length };
	});

export const voidUnpaidForCustomersProcedure = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/invoices/void-unpaid-for-customers",
		tags: ["Billing"],
		summary:
			"Void all unpaid invoices for the given customers across relevant months",
	})
	.input(
		z.object({
			organizationId: z.string(),
			customerIds: z.array(z.string()).min(1).max(500),
			year: z.number().int().optional(),
			month: z.number().int().min(1).max(12).optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);
		const { year, month } = await resolveYearMonth(
			input.organizationId,
			input.year,
			input.month,
		);
		const relevantMonths = await fetchRelevantBillingMonths(
			input.organizationId,
			year,
			month,
		);
		if (relevantMonths.length === 0) {
			return { count: 0 };
		}
		const billingMonthIdByYM = new Map<string, string>();
		for (const m of relevantMonths) {
			billingMonthIdByYM.set(`${m.year}-${m.month}`, m.id);
		}
		const candidates = await db.customerInvoice.findMany({
			where: {
				organizationId: input.organizationId,
				customerId: { in: input.customerIds },
				voidedAt: null,
				customer: getDealerScopeFilter(activeDealerId),
				OR: relevantMonths.map((m) => ({
					year: m.year,
					month: m.month,
				})),
			},
			select: { id: true, customerId: true, year: true, month: true },
		});
		if (candidates.length === 0) {
			return { count: 0 };
		}
		const settledPayments = await db.payment.findMany({
			where: {
				organizationId: input.organizationId,
				customerId: { in: input.customerIds },
				billingMonthId: { in: relevantMonths.map((m) => m.id) },
				...SETTLED_PAYMENT,
			},
			select: { customerId: true, billingMonthId: true },
		});
		const paidSet = new Set(
			settledPayments.map((p) => `${p.customerId}|${p.billingMonthId}`),
		);
		const idsToVoid = candidates
			.filter((c) => {
				const bmId = billingMonthIdByYM.get(`${c.year}-${c.month}`);
				if (!bmId) {
					return false;
				}
				return !paidSet.has(`${c.customerId}|${bmId}`);
			})
			.map((c) => c.id);
		if (idsToVoid.length === 0) {
			return { count: 0 };
		}
		const result = await db.customerInvoice.updateMany({
			where: { id: { in: idsToVoid } },
			data: {
				voidedAt: new Date(),
				voidedById: user.id,
				voidReason: VOID_REASON.ADMIN,
			},
		});
		return { count: result.count };
	});

export const unvoidInvoiceProcedure = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/invoices/{invoiceId}/unvoid",
		tags: ["Billing"],
		summary: "Unvoid an invoice",
	})
	.input(input)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);
		const existing = await loadOrgInvoice(
			input.organizationId,
			input.invoiceId,
			activeDealerId,
		);
		if (!existing.voidedAt) {
			throw new ORPCError("CONFLICT", {
				message: "Invoice is not voided",
			});
		}
		const invoice = await unvoidInvoice(db, input.invoiceId);
		return { invoice };
	});
