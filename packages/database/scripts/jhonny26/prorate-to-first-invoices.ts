/**
 * Data fix (Jhonny 26 Sep, item 8): the two "took the difference to the 1st"
 * collections whose invoices still read $25, so settlement shows a phantom
 * $17 remaining. LOCAL ONLY — nothing is written to iRadius:
 *
 * - elsyaon (JEAN CHEDIAC 2): the dealer side is already right (legacy ADD
 *   EXTRA TIME +10 days, $4 on DBL 448381) and the expiry is already
 *   2026-10-01 23:59. Invoice cmub0smnr00do0frv5a7ziqu1 $25 → $8
 *   (10 days × $25 / 30 = 8.33 → 8, what elie skaff collected). The payment
 *   was already reviewed; it gets an activity-log entry.
 * - foyergeorges: 10 billable days (re-enabled 21/09 → 01/10), invoice
 *   cmthkwlh70b230eme4vbk397n $25 → $8. Payment cmublinu400i40frv3pxbqe37 is
 *   left UNREVIEWED for the admin, and no dealer refund is attempted.
 *
 * Equivalent to running `billing.payments.alignToFirst` with days = 0; use
 * the shipped action instead when it is deployed. Idempotent: an invoice
 * whose note already carries "Prorated to 1st" is skipped.
 *
 * Dry run by default; pass --apply to write.
 * Usage: DATABASE_URL=… pnpm dlx tsx packages/database/scripts/jhonny26/prorate-to-first-invoices.ts [--apply]
 */

// @ts-expect-error -- pg has types via @types/pg but they don't cover the ESM export
import pg from "pg";

// biome-ignore lint/suspicious/noConsole: CLI script
const log = console.log.bind(console);
// biome-ignore lint/suspicious/noConsole: CLI script
const logError = console.error.bind(console);

interface Fix {
	username: string;
	invoiceId: string;
	paymentId: string;
	amount: number;
	note: string;
	/** Append an activity-log entry to the payment (reviewed rows only). */
	logOnPayment: boolean;
}

const FIXES: Fix[] = [
	{
		username: "elsyaon",
		invoiceId: "cmub0smnr00do0frv5a7ziqu1",
		paymentId: "cmubllb1500i60frvjujuauvg",
		amount: 8,
		note: "Prorated to 1st: 10 day(s) (21/09→01/10) × $25 / 30 = $8.33 → $8 (was $25); dealer ADD EXTRA TIME $4 DBL#448381",
		logOnPayment: true,
	},
	{
		username: "foyergeorges",
		invoiceId: "cmthkwlh70b230eme4vbk397n",
		paymentId: "cmublinu400i40frv3pxbqe37",
		amount: 8,
		note: "Prorated to 1st: 10 day(s) (21/09→01/10) × $25 / 30 = $8.33 → $8 (was $25); re-enabled 21/09, dealer not refunded",
		logOnPayment: false,
	},
];

interface InvoiceRow {
	id: string;
	total: number;
	tax: number;
	note: string | null;
	voidedAt: Date | null;
	username: string | null;
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
		if (apply) {
			await client.query("BEGIN");
		}
		for (const fix of FIXES) {
			const { rows } = (await client.query(
				`SELECT i.id, i.total, i.tax, i.note, i."voidedAt", c.username
				 FROM customer_invoice i JOIN customer c ON c.id = i."customerId"
				 WHERE i.id = $1`,
				[fix.invoiceId],
			)) as { rows: InvoiceRow[] };
			const inv = rows[0];
			if (!inv) {
				log(
					`${fix.username}: invoice ${fix.invoiceId} not found — skipped`,
				);
				continue;
			}
			if (inv.username !== fix.username) {
				log(
					`${fix.username}: invoice belongs to ${inv.username} — skipped`,
				);
				continue;
			}
			if (inv.voidedAt) {
				log(`${fix.username}: invoice is voided — skipped`);
				continue;
			}
			if (inv.note?.includes("Prorated to 1st")) {
				log(`${fix.username}: already prorated — skipped`);
				continue;
			}
			log(
				`${fix.username}: invoice ${inv.id} total ${inv.total} → ${fix.amount}${fix.logOnPayment ? `, activity log on ${fix.paymentId}` : ""}`,
			);
			if (!apply) {
				continue;
			}
			await client.query(
				`UPDATE customer_invoice
				 SET total = $2, "totalWithTax" = $2 + tax,
				     note = CASE WHEN note IS NULL OR note = '' THEN $3 ELSE note || ' · ' || $3 END
				 WHERE id = $1`,
				[fix.invoiceId, fix.amount, fix.note],
			);
			if (fix.logOnPayment) {
				const entry = JSON.stringify([
					{
						action: "aligned_to_first",
						status: "success",
						detail: `+0 days (aligned in iRadius), dealer $4.00 (legacy), invoice $${inv.total}→$${fix.amount}`,
						timestamp: new Date().toISOString(),
					},
				]);
				await client.query(
					`UPDATE payment
					 SET "activityLog" = COALESCE("activityLog", '[]'::jsonb) || $2::jsonb,
					     "updatedAt" = NOW()
					 WHERE id = $1`,
					[fix.paymentId, entry],
				);
			}
		}
		if (apply) {
			await client.query("COMMIT");
			log("\nApplied.");
		} else {
			log("\nDry run. Re-run with --apply to write.");
		}
	} catch (error) {
		if (apply) {
			await client.query("ROLLBACK").catch(() => undefined);
		}
		logError("Failed:", error);
		process.exit(1);
	} finally {
		await client.end();
	}
}

main().catch(logError);
