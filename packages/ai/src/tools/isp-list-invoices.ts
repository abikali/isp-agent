import { db } from "@repo/database";
import {
	addCoverage,
	COVERING_PAYMENT,
	invoiceAmount,
	type MonthCoverage,
	monthRemaining,
	monthSettled,
} from "@repo/database/settlement";
import { logger } from "@repo/logs";
import { getBaseUrl } from "@repo/utils";
import { tool } from "ai";
import { z } from "zod";
import type { RegisteredTool, ToolContext } from "./types";

/**
 * The customer's billed months with what is paid and what is owed, and a
 * receipt link for each paid month — the answer to "send me my old bills".
 *
 * Works only for the VERIFIED customer of this conversation: invoices are
 * personal, and a name typed into the chat is not proof of anything. No
 * output schema (see CLAUDE.md, ISP tools).
 */
function createListInvoicesTool(context: ToolContext) {
	return tool({
		description:
			"List the verified customer's billed months (newest first) with amount, status (paid / partial / unpaid), remaining balance and a receipt link for paid months. " +
			"Returns { success, verified, customer: { fullName, username }, invoices: [{ month: 'YYYY-MM', total, status, paidTotal, remaining, receiptUrl? }], summary: { unpaidCount, totalDue } }. " +
			"Fails with verified=false when the conversation is not linked to a customer account.",
		inputSchema: z.object({
			months: z
				.number()
				.int()
				.min(1)
				.max(24)
				.optional()
				.describe("How many billed months to return (default 6)"),
		}),
		execute: async ({ months }) => {
			try {
				const conversation = await db.aiConversation.findUnique({
					where: { id: context.conversationId },
					select: { verifiedCustomerId: true },
				});
				const customerId = conversation?.verifiedCustomerId ?? null;
				if (!customerId) {
					return {
						success: false,
						verified: false,
						message:
							"This conversation is not linked to a customer account. Ask the customer for the phone number registered on their account (and the account holder's name); never list invoices from memory.",
					};
				}
				const take = months ?? 6;
				const [customer, invoices, billingMonths, payments] =
					await Promise.all([
						db.customer.findUnique({
							where: { id: customerId },
							select: {
								firstName: true,
								lastName: true,
								username: true,
							},
						}),
						db.customerInvoice.findMany({
							where: {
								organizationId: context.organizationId,
								customerId,
								voidedAt: null,
							},
							orderBy: [{ year: "desc" }, { month: "desc" }],
							take,
							select: {
								id: true,
								year: true,
								month: true,
								total: true,
								totalWithTax: true,
								expiryDate: true,
							},
						}),
						db.billingMonth.findMany({
							where: { organizationId: context.organizationId },
							select: { id: true, year: true, month: true },
						}),
						db.payment.findMany({
							where: {
								organizationId: context.organizationId,
								customerId,
								...COVERING_PAYMENT,
							},
							select: {
								id: true,
								billingMonthId: true,
								invoiceId: true,
								paidAmount: true,
								discount: true,
								freeAccount: true,
								paidAt: true,
							},
							orderBy: { paidAt: "desc" },
						}),
					]);
				const monthIdByYM = new Map(
					billingMonths.map((m) => [`${m.year}-${m.month}`, m.id]),
				);
				const coverage = new Map<string, MonthCoverage>();
				const newestPaymentByMonth = new Map<string, string>();
				for (const row of payments) {
					coverage.set(
						row.billingMonthId,
						addCoverage(coverage.get(row.billingMonthId), row),
					);
					if (
						row.paidAmount > 0 &&
						!newestPaymentByMonth.has(row.billingMonthId)
					) {
						newestPaymentByMonth.set(row.billingMonthId, row.id);
					}
				}
				const base = getBaseUrl();
				let unpaidCount = 0;
				let totalDue = 0;
				const rows = invoices.map((inv) => {
					const monthId = monthIdByYM.get(`${inv.year}-${inv.month}`);
					const cov = monthId ? coverage.get(monthId) : undefined;
					const amount = invoiceAmount(inv);
					const paid = monthSettled(amount, cov);
					const remaining = monthRemaining(amount, cov);
					const status = paid
						? "paid"
						: cov && cov.covered > 0
							? "partial"
							: "unpaid";
					if (!paid) {
						unpaidCount++;
						totalDue += remaining;
					}
					const paymentId =
						payments.find(
							(p) => p.invoiceId === inv.id && p.paidAmount > 0,
						)?.id ??
						(monthId
							? newestPaymentByMonth.get(monthId)
							: undefined);
					return {
						month: `${inv.year}-${String(inv.month).padStart(2, "0")}`,
						total: amount,
						status,
						paidTotal: cov?.covered ?? 0,
						remaining,
						...(inv.expiryDate
							? {
									dueBy: inv.expiryDate
										.toISOString()
										.slice(0, 10),
								}
							: {}),
						...(paymentId
							? { receiptUrl: `${base}/invoice/${paymentId}` }
							: {}),
					};
				});
				return {
					success: true,
					verified: true,
					customer: {
						fullName:
							[customer?.firstName, customer?.lastName]
								.filter(Boolean)
								.join(" ") || null,
						username: customer?.username ?? null,
					},
					invoices: rows,
					summary: {
						unpaidCount,
						totalDue: Math.round(totalDue * 100) / 100,
					},
				};
			} catch (error) {
				logger.error("isp-list-invoices failed", {
					conversationId: context.conversationId,
					error: String(error),
				});
				return {
					success: false,
					error: "Could not load invoices right now.",
				};
			}
		},
	});
}

export const ispListInvoices: RegisteredTool = {
	metadata: {
		id: "isp-list-invoices",
		name: "List invoices",
		description:
			"Billed months, paid/unpaid status and receipt links for the verified customer",
		category: "isp",
		requiresConfig: false,
	},
	factory: createListInvoicesTool,
	defaultPromptSection: `## Invoices & Receipts (isp-list-invoices)
Use it when the customer asks about bills, what they owe, past months, or wants a receipt. It only works for the VERIFIED customer; if the result says not verified, ask for the phone number registered on the account and stop — never recite invoices from memory or from an earlier chat.
Present each month as: month, amount, status (paid / partially paid — remaining X / unpaid). For paid or partially paid months, send the receipt link as plain text on its own line (no markdown, no brackets) — WhatsApp turns it into a tappable link.
Never invent months, amounts, or links; if a month is missing from the result, say the team can check it and escalate. For disputes ("I paid that") ask for the receipt screenshot and escalate; do not mark anything paid.`,
};
