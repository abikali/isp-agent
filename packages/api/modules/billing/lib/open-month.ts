/**
 * Single entry point for creating `billing_cycle` rows. On first create,
 * automatically generates `customer_invoice` rows for the new month so the
 * unpaid-list gate and customer-detail invoice tab stay accurate without
 * an iRadius sync.
 *
 * Historical backfill paths (e.g. billing-sync seeding closed months from
 * PHP payment history) should pass `skipInvoiceGeneration: true`.
 */

import type { Prisma } from "@repo/database";
import { generateInvoicesForMonth } from "./generate-invoices";

type Client = Prisma.TransactionClient;

interface OpenBillingMonthOptions {
	locked?: boolean;
	skipInvoiceGeneration?: boolean;
}

export async function openBillingMonth(
	tx: Client,
	organizationId: string,
	year: number,
	month: number,
	options: OpenBillingMonthOptions = {},
) {
	const existing = await tx.billingMonth.findUnique({
		where: {
			organizationId_year_month: { organizationId, year, month },
		},
	});
	if (existing) {
		return existing;
	}

	const billingMonth = await tx.billingMonth.create({
		data: {
			organizationId,
			year,
			month,
			locked: options.locked ?? false,
		},
	});

	if (!options.skipInvoiceGeneration) {
		await generateInvoicesForMonth(tx, organizationId, year, month);
	}

	return billingMonth;
}
