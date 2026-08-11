/**
 * One-off script: back-fill the default worker-portal dropdown options for all
 * existing organizations, so the field portal never renders an empty dropdown
 * after the `worker_option` table ships.
 *
 * Idempotent — re-running only fills in rows an admin hasn't created yet, and
 * never overwrites labels/order an admin has since edited.
 *
 * Usage: pnpm --filter @repo/database seed:worker-options
 */

import { createId } from "@paralleldrive/cuid2";
// @ts-expect-error -- pg has types via @types/pg but they don't cover the ESM export
import pg from "pg";
import {
	DEFAULT_WORKER_OPTIONS,
	WORKER_OPTION_LIST_KEYS,
} from "../lib/worker-options";

// biome-ignore lint/suspicious/noConsole: CLI script
const log = console.log.bind(console);
// biome-ignore lint/suspicious/noConsole: CLI script
const logError = console.error.bind(console);

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
		let inserted = 0;

		for (const org of orgs) {
			for (const listKey of WORKER_OPTION_LIST_KEYS) {
				for (const opt of DEFAULT_WORKER_OPTIONS[listKey]) {
					const result = await client.query(
						`INSERT INTO worker_option (id, "organizationId", "listKey", value, label, "labelAr", "sortOrder", "createdAt", "updatedAt")
						 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
						 ON CONFLICT ("organizationId", "listKey", value) DO NOTHING`,
						[
							createId(),
							org.id,
							listKey,
							opt.value,
							opt.label,
							opt.labelAr ?? null,
							opt.sortOrder,
							now,
						],
					);
					inserted += result.rowCount ?? 0;
				}
			}
			log(`✓ ${org.name}`);
		}

		log(`\nDone! Inserted ${inserted} missing option(s).`);
	} catch (error) {
		logError("Failed:", error);
		process.exit(1);
	} finally {
		await client.end();
	}
}

main().catch(logError);
