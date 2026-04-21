/**
 * Local invoice generation — replaces Phase 10 of the iRadius sync.
 *
 * A `customer_invoice` row is the "this customer was billed for month (Y, M)"
 * signal consumed by `hasBilledInvoiceFilter` and the customer-detail
 * Invoices tab. We generate one row per billable customer at billing-month
 * start (see `openBillingMonth`).
 */

import type { Prisma } from "@repo/database";
import { customerMonthlyDue } from "./calculations";
import { BILLABLE_CUSTOMER_STATUSES } from "./filters";
import { getMonthDateRange } from "./resolve-month";

type Client = Prisma.TransactionClient;

interface GenerateResult {
	created: number;
	skipped: number;
}

/**
 * Create `customer_invoice` rows for every billable customer in the given month.
 *
 * Billable = ACTIVE or PENDING, non-"free" group, activated by end-of-month,
 * with a positive monthly due. `skipDuplicates` + the
 * (organizationId, customerId, year, month) unique key make this idempotent.
 */
export async function generateInvoicesForMonth(
	tx: Client,
	organizationId: string,
	year: number,
	month: number,
): Promise<GenerateResult> {
	const range = getMonthDateRange(year, month);

	const customers = await tx.customer.findMany({
		where: {
			organizationId,
			status: { in: [...BILLABLE_CUSTOMER_STATUSES] },
			OR: [
				{ groupName: null },
				{
					NOT: {
						groupName: { equals: "free", mode: "insensitive" },
					},
				},
			],
			AND: [
				{
					OR: [
						{ activatedAt: null },
						{ activatedAt: { lte: range.lte } },
					],
				},
			],
		},
		select: {
			id: true,
			monthlyRate: true,
			iptvPrice: true,
			realIpPrice: true,
			discount: true,
			expiresAt: true,
			plan: { select: { monthlyPrice: true } },
		},
	});

	const invoiceDate = range.gte;
	const rows: Prisma.CustomerInvoiceCreateManyInput[] = [];
	let skipped = 0;

	for (const customer of customers) {
		const total = customerMonthlyDue(customer);
		if (total <= 0) {
			skipped++;
			continue;
		}
		rows.push({
			organizationId,
			customerId: customer.id,
			year,
			month,
			invoiceDate,
			expiryDate: customer.expiresAt ?? range.lte,
			total,
			discount: customer.discount ?? 0,
			tax: 0,
			totalWithTax: total,
			paid: false,
		});
	}

	if (rows.length === 0) {
		return { created: 0, skipped };
	}

	const created = await tx.customerInvoice.createMany({
		data: rows,
		skipDuplicates: true,
	});

	return { created: created.count, skipped };
}
