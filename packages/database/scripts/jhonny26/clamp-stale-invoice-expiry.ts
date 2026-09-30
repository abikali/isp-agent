/**
 * Data fix (Jhonny 26 Sep, item 5): lift stale frozen `expiryDate`s on live
 * customers' invoices to the start of the invoice's month.
 *
 * A month-M invoice created before a mid-month reactivation froze the
 * customer's year-old expiry (ginaantipas: "Due since 11/11/2025, 318d
 * overdue"). The generator and createInvoice now clamp to the month start
 * (`frozenInvoiceExpiry`); this brings the ~15 existing rows in line.
 *
 * Only non-voided invoices of NON-deleted customers are touched; soft-deleted
 * customers' invoices are left alone (voiding them is a separate decision).
 * Idempotent: a fixed row no longer matches `expiryDate < invoiceDate`.
 *
 * Dry run by default; pass --apply to write.
 * Usage: DATABASE_URL=… pnpm dlx tsx packages/database/scripts/jhonny26/clamp-stale-invoice-expiry.ts [--apply]
 */

// @ts-expect-error -- pg has types via @types/pg but they don't cover the ESM export
import pg from "pg";

// biome-ignore lint/suspicious/noConsole: CLI script
const log = console.log.bind(console);
// biome-ignore lint/suspicious/noConsole: CLI script
const logError = console.error.bind(console);

const MATCH = `
FROM customer_invoice i
JOIN customer c ON c.id = i."customerId"
JOIN organization o ON o.id = i."organizationId"
WHERE c."deletedAt" IS NULL
  AND i."voidedAt" IS NULL
  AND i."expiryDate" < i."invoiceDate"`;

interface Row {
	id: string;
	slug: string;
	username: string | null;
	year: number;
	month: number;
	expiryDate: Date;
	invoiceDate: Date;
}

async function main() {
	const apply = process.argv.includes("--apply");
	const databaseUrl = process.env["DATABASE_URL"];
	if (!databaseUrl) {
		logError("DATABASE_URL is not set");
		process.exit(1);
	}
	const client = new pg.Client({ connectionString: databaseUrl });
	await client.connect();
	try {
		const { rows } = (await client.query(
			`SELECT i.id, o.slug, c.username, i.year, i.month, i."expiryDate", i."invoiceDate" ${MATCH}
			 ORDER BY o.slug, c.username, i.year, i.month`,
		)) as { rows: Row[] };
		log(
			`${rows.length} invoice(s) with expiryDate before their month start:`,
		);
		for (const r of rows) {
			log(
				`  ${r.slug} ${r.username ?? "(no username)"} ${r.year}-${String(r.month).padStart(2, "0")} ${r.expiryDate.toISOString()} → ${r.invoiceDate.toISOString()}`,
			);
		}
		if (!apply) {
			log("\nDry run. Re-run with --apply to write.");
			return;
		}
		const result = await client.query(
			`UPDATE customer_invoice SET "expiryDate" = "invoiceDate"
			 WHERE id IN (SELECT i.id ${MATCH})`,
		);
		log(`\nUpdated ${result.rowCount ?? 0} invoice(s).`);
	} catch (error) {
		logError("Failed:", error);
		process.exit(1);
	} finally {
		await client.end();
	}
}

main().catch(logError);
