/**
 * One-shot: generate customer_invoice rows for the currently-active billing
 * month on every organization.
 *
 * Used after the decouple-invoices-from-iradius migration to seed invoices
 * for the current month (since that migration wipes all historical rows).
 * Safe to re-run — `generateInvoicesForMonth` uses `skipDuplicates` with the
 * (org, customer, year, month) unique key.
 *
 * Run:
 *   source .env && pnpm tsx packages/api/scripts/generate-current-month-invoices.ts
 */

// biome-ignore-all lint/suspicious/noConsole: one-shot CLI script, console is the output channel

import { db } from "@repo/database";
import { generateInvoicesForMonth } from "../modules/billing/lib/generate-invoices";

async function main() {
	const activeMonths = await db.billingMonth.findMany({
		where: { locked: false },
		select: { id: true, organizationId: true, year: true, month: true },
	});

	if (activeMonths.length === 0) {
		console.log("[backfill] No unlocked billing_cycle rows found.");
		return;
	}

	console.log(
		`[backfill] Found ${activeMonths.length} active billing month(s).`,
	);

	let totalCreated = 0;
	let totalSkipped = 0;
	for (const bm of activeMonths) {
		const { created, skipped } = await generateInvoicesForMonth(
			db,
			bm.organizationId,
			bm.year,
			bm.month,
		);
		console.log(
			`[backfill] org=${bm.organizationId} ${bm.year}-${String(bm.month).padStart(2, "0")}: created=${created} skipped=${skipped}`,
		);
		totalCreated += created;
		totalSkipped += skipped;
	}

	console.log(
		`[backfill] Done. total created=${totalCreated}, skipped=${totalSkipped}.`,
	);
}

main()
	.catch((err) => {
		console.error("[backfill] Failed:", err);
		process.exit(1);
	})
	.finally(async () => {
		await db.$disconnect();
	});
