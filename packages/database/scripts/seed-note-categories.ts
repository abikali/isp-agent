/**
 * One-off script: Seed default note categories for all existing organizations.
 * Usage: pnpm --filter @repo/database seed:note-categories
 */

import { createId } from "@paralleldrive/cuid2";
// @ts-expect-error -- pg has types via @types/pg but they don't cover the ESM export
import pg from "pg";

// biome-ignore lint/suspicious/noConsole: CLI script
const log = console.log.bind(console);
// biome-ignore lint/suspicious/noConsole: CLI script
const logError = console.error.bind(console);

const DEFAULT_NOTE_CATEGORIES = [
	{ value: "DOWNGRADE", label: "Downgrade", labelAr: "تصغير", sortOrder: 1 },
	{ value: "UPGRADE", label: "Upgrade", labelAr: "تكبير", sortOrder: 2 },
	{ value: "DISCOUNT", label: "Discount", labelAr: "خصم", sortOrder: 3 },
	{
		value: "REFERRAL",
		label: "Referral",
		labelAr: "احضر صديق",
		sortOrder: 4,
	},
	{ value: "MOVED", label: "Moved", labelAr: "انتقل", sortOrder: 5 },
	{
		value: "POOR_SERVICE",
		label: "Poor Service",
		labelAr: "انترنت غير جيد",
		sortOrder: 6,
	},
	{
		value: "CANT_PAY",
		label: "Can't Pay",
		labelAr: "لا يستطيع الدفع",
		sortOrder: 7,
	},
	{
		value: "TEMP_STOP",
		label: "Temp Stop",
		labelAr: "توقيف مؤقت",
		sortOrder: 8,
	},
];

async function main() {
	const databaseUrl = process.env["DATABASE_URL"];
	if (!databaseUrl) {
		logError("DATABASE_URL is not set");
		process.exit(1);
	}

	const client = new pg.Client({ connectionString: databaseUrl });
	await client.connect();

	try {
		const orgsResult = await client.query(
			"SELECT id, name FROM organization",
		);
		const orgs = orgsResult.rows;
		log(`Found ${orgs.length} organization(s)\n`);

		const now = new Date();

		for (const org of orgs) {
			for (const cat of DEFAULT_NOTE_CATEGORIES) {
				await client.query(
					`INSERT INTO note_category (id, "organizationId", value, label, "labelAr", "sortOrder", "createdAt", "updatedAt")
					 VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
					 ON CONFLICT ("organizationId", value) DO UPDATE SET
						label = EXCLUDED.label,
						"labelAr" = EXCLUDED."labelAr",
						"sortOrder" = EXCLUDED."sortOrder",
						"updatedAt" = EXCLUDED."updatedAt"`,
					[
						createId(),
						org.id,
						cat.value,
						cat.label,
						cat.labelAr,
						cat.sortOrder,
						now,
					],
				);
			}
			log(`✓ ${org.name}`);
		}

		log("\nDone!");
	} catch (error) {
		logError("Failed:", error);
		process.exit(1);
	} finally {
		await client.end();
	}
}

main().catch(logError);
