/**
 * One-off import: legacy billing `stations` + `station_workers` → our `Base` +
 * `BaseEmployee`. The billing "stations" are name + assigned-workers records,
 * which map directly onto our Bases concept (NOT iRadius network stations).
 *
 * Source snapshot: `import-bases.data.json` (extracted from the billing `bts`
 * DB — 64 bases, 110 worker assignments). Workers are matched to employees by
 * `employee.username` within the target org.
 *
 * Idempotent: re-running upserts each base by (organizationId, name) and
 * replaces its worker assignments. Safe to run multiple times.
 *
 * Usage:
 *   pnpm --filter @repo/database import:bases -- [orgSlug] [--dry-run]
 *   (orgSlug defaults to "abiroot")
 */

import { readFileSync } from "node:fs";
import { createId } from "@paralleldrive/cuid2";
// @ts-expect-error -- pg has types via @types/pg but they don't cover the ESM export
import pg from "pg";

// biome-ignore lint/suspicious/noConsole: CLI script
const log = console.log.bind(console);
// biome-ignore lint/suspicious/noConsole: CLI script
const logError = console.error.bind(console);

interface BaseSeed {
	name: string;
	workers: string[];
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const orgSlug = args.find((a) => !a.startsWith("--")) ?? "abiroot";

const data: BaseSeed[] = JSON.parse(
	readFileSync(new URL("./import-bases.data.json", import.meta.url), "utf-8"),
);

async function main() {
	const databaseUrl = process.env["DATABASE_URL"];
	if (!databaseUrl) {
		logError("DATABASE_URL is not set");
		process.exit(1);
	}

	const client = new pg.Client({ connectionString: databaseUrl });
	await client.connect();

	try {
		const orgResult = await client.query(
			'SELECT id, "activeDealerId" FROM organization WHERE slug = $1',
			[orgSlug],
		);
		const org = orgResult.rows[0];
		if (!org) {
			logError(`Organization with slug "${orgSlug}" not found`);
			process.exit(1);
		}
		const organizationId: string = org.id;
		const dealerId: string | null = org.activeDealerId ?? null;
		log(
			`Org "${orgSlug}" (${organizationId}) — dealer scope: ${dealerId ?? "none"}`,
		);

		// Map worker username -> employee id (org-scoped, not soft-deleted).
		const empResult = await client.query(
			'SELECT id, username FROM employee WHERE "organizationId" = $1 AND "deletedAt" IS NULL AND username IS NOT NULL',
			[organizationId],
		);
		const empByUsername = new Map<string, string>();
		for (const row of empResult.rows) {
			empByUsername.set(row.username, row.id);
		}
		log(`Loaded ${empByUsername.size} employee username(s)\n`);

		const unmapped = new Set<string>();
		let created = 0;
		let updated = 0;
		let assignments = 0;

		if (dryRun) {
			log("DRY RUN — no writes will be made\n");
		} else {
			await client.query("BEGIN");
		}

		const now = new Date();

		for (const seed of data) {
			const name = seed.name.trim();
			const employeeIds: string[] = [];
			for (const username of seed.workers) {
				const id = empByUsername.get(username);
				if (id) {
					employeeIds.push(id);
				} else {
					unmapped.add(username);
				}
			}

			// Upsert base by (organizationId, name).
			const existing = await client.query(
				'SELECT id FROM base WHERE "organizationId" = $1 AND name = $2 LIMIT 1',
				[organizationId, name],
			);
			let baseId: string;
			if (existing.rows[0]) {
				baseId = existing.rows[0].id;
				updated += 1;
				if (!dryRun) {
					await client.query(
						'UPDATE base SET "dealerId" = $1, "updatedAt" = $2 WHERE id = $3',
						[dealerId, now, baseId],
					);
				}
			} else {
				baseId = createId();
				created += 1;
				if (!dryRun) {
					await client.query(
						'INSERT INTO base (id, "organizationId", "dealerId", name, description, address, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, NULL, NULL, $5, $5)',
						[baseId, organizationId, dealerId, name, now],
					);
				}
			}

			// Replace worker assignments.
			if (!dryRun) {
				await client.query(
					'DELETE FROM base_employee WHERE "baseId" = $1',
					[baseId],
				);
				for (const employeeId of employeeIds) {
					await client.query(
						'INSERT INTO base_employee (id, "baseId", "employeeId", "assignedAt") VALUES ($1, $2, $3, $4)',
						[createId(), baseId, employeeId, now],
					);
				}
			}
			assignments += employeeIds.length;
			log(
				`${dryRun ? "would " : ""}${existing.rows[0] ? "update" : "create"}: ${name} → [${seed.workers.join(", ")}]`,
			);
		}

		if (!dryRun) {
			await client.query("COMMIT");
		}

		log("\n— Summary —");
		log(`bases created:    ${created}`);
		log(`bases updated:    ${updated}`);
		log(`worker assigned:  ${assignments}`);
		if (unmapped.size > 0) {
			logError(
				`\n⚠ ${unmapped.size} worker username(s) had no matching employee and were skipped: ${[...unmapped].join(", ")}`,
			);
		} else {
			log("all workers matched an employee ✓");
		}
		log(dryRun ? "\nDRY RUN complete (no changes)" : "\nDone!");
	} catch (error) {
		if (!dryRun) {
			await client.query("ROLLBACK").catch(() => {});
		}
		logError("Failed:", error);
		process.exit(1);
	} finally {
		await client.end();
	}
}

main().catch(logError);
