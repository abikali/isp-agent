/**
 * One-off backfill: copy legacy expense receipt photos from the old billing
 * server into R2 and rewrite Expense.receiptUrl to the image-proxy URL.
 *
 * Run AFTER deploying the billing-sync receipt fix (so a manual sync won't
 * re-clobber the migrated URLs back to bare filenames). Idempotent — safe to
 * re-run.
 *
 *   pnpm --filter @repo/jobs exec tsx scripts/backfill-legacy-receipts.ts
 *
 * Honors BILLING_RECEIPTS_BASE_URL (defaults to the billing worker_images dir)
 * and the standard R2 env (S3_ vars + AVATARS_BUCKET_NAME) + DATABASE_URL.
 */

import { backfillLegacyReceipts } from "../src/workers/lib/legacy-receipts";

async function main() {
	const orgArg = process.argv[2];
	// biome-ignore lint/suspicious/noConsole: one-off CLI script, console is the UX
	console.log(
		`Backfilling legacy receipts${orgArg ? ` for org ${orgArg}` : " (all orgs)"}…`,
	);
	const result = await backfillLegacyReceipts({
		...(orgArg ? { organizationId: orgArg } : {}),
		onProgress: (done, total) => {
			if (done % 25 === 0) {
				// biome-ignore lint/suspicious/noConsole: one-off CLI script, console is the UX
				console.log(`  ${done}/${total}`);
			}
		},
	});
	// biome-ignore lint/suspicious/noConsole: one-off CLI script, console is the UX
	console.log("Done:", JSON.stringify(result, null, 2));
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		// biome-ignore lint/suspicious/noConsole: one-off CLI script, console is the UX
		console.error("Backfill failed:", e);
		process.exit(1);
	});
