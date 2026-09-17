/**
 * One-off script: backfill `employee.cash_role` (field role) from the signals
 * the code derived it from before the column existed.
 *
 * - collector: department BILLING, or has customers as collector
 * - worker:    worker portal layout / org `worker` role, worker-assigned
 *              customers, setup requests, installations, worker stock, or
 *              setup/installation/stock cash-ledger rows
 *
 * Only rows with cash_role NULL are touched. Employees with both signals are
 * left NULL and printed for a human decision. Code treats NULL as "fall back
 * to the old derivation", so running this is optional for correctness.
 *
 * Dry run by default; pass --apply to write.
 * Usage: pnpm --filter @repo/database backfill:cash-role [-- --apply]
 *
 * Production uses the reviewed SQL copy of this logic instead
 * (prod-actions/employee-cash-role-backfill.sql), not this script.
 */

// @ts-expect-error -- pg has types via @types/pg but they don't cover the ESM export
import pg from "pg";

// biome-ignore lint/suspicious/noConsole: CLI script
const log = console.log.bind(console);
// biome-ignore lint/suspicious/noConsole: CLI script
const logError = console.error.bind(console);

const SIGNALS_SQL = `
SELECT
	e.id, e.username, e.name, e.department,
	(
		e.department = 'BILLING'
		OR EXISTS (SELECT 1 FROM customer c WHERE c."collectorId" = e.id)
	) AS collector_sig,
	(
		e.preferred_layout = 'worker'
		OR EXISTS (
			SELECT 1 FROM member m
			WHERE m."userId" = e."userId"
				AND m."organizationId" = e."organizationId"
				AND m.role = 'worker'
		)
		OR EXISTS (SELECT 1 FROM customer c WHERE c.worker_id = e.id)
		OR EXISTS (SELECT 1 FROM customer_setup_request r WHERE r."requestedById" = e.id)
		OR EXISTS (SELECT 1 FROM installation i WHERE i."employeeId" = e.id)
		OR EXISTS (SELECT 1 FROM worker_stock ws WHERE ws."employeeId" = e.id)
		OR EXISTS (
			SELECT 1 FROM cash_collection cc
			WHERE cc."collectorId" = e.id
				AND cc.type IN ('NEW_USER_SETUP', 'INSTALLATION_COST', 'STOCK_RECEIVED')
		)
	) AS worker_sig
FROM employee e
WHERE e.cash_role IS NULL
ORDER BY e.username`;

interface SignalRow {
	id: string;
	username: string | null;
	name: string;
	department: string | null;
	collector_sig: boolean;
	worker_sig: boolean;
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
		const { rows } = (await client.query(SIGNALS_SQL)) as {
			rows: SignalRow[];
		};

		const collectors = rows.filter((r) => r.collector_sig && !r.worker_sig);
		const workers = rows.filter((r) => r.worker_sig && !r.collector_sig);
		const conflicts = rows.filter((r) => r.collector_sig && r.worker_sig);
		const label = (r: SignalRow) =>
			`${r.username ?? "(no username)"} — ${r.name} [${r.department ?? "no dept"}]`;

		log(`COLLECTOR (${collectors.length}):`);
		for (const r of collectors) {
			log(`  ${label(r)}`);
		}
		log(`WORKER (${workers.length}):`);
		for (const r of workers) {
			log(`  ${label(r)}`);
		}
		log(`Both signals — left unset, decide by hand (${conflicts.length}):`);
		for (const r of conflicts) {
			log(`  ${label(r)}`);
		}
		log(
			`No signal — left unset (${rows.length - collectors.length - workers.length - conflicts.length})`,
		);

		if (!apply) {
			log("\nDry run. Re-run with --apply to write.");
			return;
		}

		await client.query("BEGIN");
		const setRole = async (ids: string[], role: string) => {
			if (ids.length === 0) {
				return 0;
			}
			const result = await client.query(
				`UPDATE employee SET cash_role = $1::"EmployeeCashRole"
				 WHERE id = ANY($2::text[]) AND cash_role IS NULL`,
				[role, ids],
			);
			return result.rowCount ?? 0;
		};
		const c = await setRole(
			collectors.map((r) => r.id),
			"COLLECTOR",
		);
		const w = await setRole(
			workers.map((r) => r.id),
			"WORKER",
		);
		await client.query("COMMIT");
		log(`\nUpdated ${c} collector(s) and ${w} worker(s).`);
	} catch (error) {
		await client.query("ROLLBACK").catch(() => undefined);
		logError("Failed:", error);
		process.exit(1);
	} finally {
		await client.end();
	}
}

main().catch(logError);
