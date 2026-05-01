/**
 * Seed dotnet2 dealer's onboarding data.
 *
 * Reads `~/Downloads/ListUsers.xlsx` (or any path passed via `--xlsx <path>`)
 * and idempotently:
 *
 *   1. Creates the `dotnet2` org if missing
 *   2. Creates / reuses two users (dealer + collector) with credential logins
 *   3. Adopts the existing `dotnet2` dealer record (id `cmndqeke40013wt1kzh3l9ty2`)
 *      under the new org and links the dealer's `userId` to the dealer login
 *   4. Sets the org's `activeDealerId` to that dealer
 *   5. Creates the collector employee (`colldanysleiman`) and the two
 *      service plans (`4MB - 6GB`, `6MB - 10GB`) under the new org
 *   6. Imports each customer row, skipping any whose username is already
 *      present in the org
 *
 * Decisions baked in:
 *   • status:   `Blocked = 1` → `INACTIVE`, `Blocked = 0` → `ACTIVE`
 *   • mobile:   normalized to `+961…` via `normalizeLebanesePhone`,
 *               literal "undefined" / `N/A` dropped
 *   • mac:      literal "N/A" dropped; duplicates kept verbatim
 *   • plan:     "4MB - 6GB" → 4 Mbps / 6 GB; "6MB - 10GB" → 6 Mbps / 10 GB
 *   • iRadius:  the dealer keeps its existing `externalId = 82095`; new
 *               customers seeded here get `externalId = null` so a future
 *               iRadius sync won't try to claim them
 *   • collector login: layout `collector` so they land on `/collect/<slug>`
 *
 * Usage:
 *   pnpm --filter @repo/database seed:dotnet2
 *   pnpm --filter @repo/database seed:dotnet2 -- --xlsx /path/to/ListUsers.xlsx
 *
 * Re-runs are safe — every row is upserted by a stable natural key.
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createId } from "@paralleldrive/cuid2";
import { hashPasswordSync } from "@repo/utils/password";
// @ts-expect-error -- pg has types via @types/pg but they don't cover the ESM export
import pg from "pg";
import { read, utils } from "xlsx";
import { normalizeLebanesePhone } from "../lib/phones";

// biome-ignore lint/suspicious/noConsole: CLI script
const log = console.log.bind(console);
// biome-ignore lint/suspicious/noConsole: CLI script
const logError = console.error.bind(console);

const DEALER_USERNAME = "dotnet2";
const DEALER_DISPLAY_NAME = "elie atalah";
const DEALER_IRADIUS_EXTERNAL_ID = "82095";
const ORG_NAME = "dotnet2";
const ORG_SLUG = "dotnet2";

const DEALER_LOGIN = {
	email: "dotnet2@libancomlb.com",
	name: "elie atalah",
	password: "123456",
	role: "owner",
};

const COLLECTOR_LOGIN = {
	email: "colldanysleiman@libancomlb.com",
	name: "dany sleiman",
	username: "colldanysleiman",
	password: "123456",
	role: "member",
};

const PLAN_DEFS = [
	{
		name: "4MB - 6GB",
		downloadSpeed: 4,
		uploadSpeed: 4,
		monthlyQuota: 6,
		monthlyPrice: 20,
	},
	{
		name: "6MB - 10GB",
		downloadSpeed: 6,
		uploadSpeed: 6,
		monthlyQuota: 10,
		monthlyPrice: 30,
	},
] as const;

interface XlsxRow {
	Username?: string;
	Name?: string;
	Address?: string | null;
	Mobile?: string | null;
	Note?: string | null;
	Expiry?: string | null;
	Service?: string;
	"acount price"?: number;
	Blocked?: number;
	"Date Created"?: string | null;
	Balance?: number;
	"Mac Address"?: string | null;
}

function parseArgs(): { xlsxPath: string } {
	const args = process.argv.slice(2);
	const idx = args.indexOf("--xlsx");
	if (idx >= 0 && args[idx + 1]) {
		return { xlsxPath: args[idx + 1] as string };
	}
	return { xlsxPath: join(homedir(), "Downloads", "ListUsers.xlsx") };
}

function blankIfUndefined(value: unknown): string | null {
	if (value == null) {
		return null;
	}
	const trimmed = String(value).trim();
	if (!trimmed || trimmed.toLowerCase() === "undefined") {
		return null;
	}
	return trimmed;
}

function splitName(full: string): { first: string; last: string | null } {
	const trimmed = full.trim();
	const space = trimmed.indexOf(" ");
	if (space === -1) {
		return { first: trimmed, last: null };
	}
	return {
		first: trimmed.slice(0, space).trim(),
		last: trimmed.slice(space + 1).trim() || null,
	};
}

function buildPhones(raw: string | null): {
	phones: { number: string; primary: boolean }[];
	mobile: string | null;
} {
	const cleaned = blankIfUndefined(raw);
	if (!cleaned) {
		return { phones: [], mobile: null };
	}
	const normalized = normalizeLebanesePhone(cleaned);
	return {
		phones: [{ number: normalized, primary: true }],
		mobile: normalized,
	};
}

function parseDateOrNull(raw: string | null | undefined): Date | null {
	const cleaned = blankIfUndefined(raw);
	if (!cleaned) {
		return null;
	}
	const dt = new Date(cleaned);
	return Number.isNaN(dt.getTime()) ? null : dt;
}

function parseMac(raw: string | null | undefined): string | null {
	const cleaned = blankIfUndefined(raw);
	if (!cleaned || cleaned.toUpperCase() === "N/A") {
		return null;
	}
	return cleaned;
}

function statusFromBlocked(blocked: number | undefined): string {
	return blocked === 1 ? "INACTIVE" : "ACTIVE";
}

async function main() {
	const databaseUrl = process.env["DATABASE_URL"];
	if (!databaseUrl) {
		logError("DATABASE_URL is not set");
		process.exit(1);
	}

	const { xlsxPath } = parseArgs();
	if (!existsSync(xlsxPath)) {
		logError(`xlsx not found: ${xlsxPath}`);
		process.exit(1);
	}

	const wb = read(
		await import("node:fs").then((fs) => fs.readFileSync(xlsxPath)),
	);
	const ws = wb.Sheets[wb.SheetNames[0] as string];
	if (!ws) {
		logError("Empty workbook");
		process.exit(1);
	}
	const rows = utils.sheet_to_json<XlsxRow>(ws, { defval: null });
	log(`📂 ${xlsxPath} → ${rows.length} rows\n`);

	const client = new pg.Client({ connectionString: databaseUrl });
	await client.connect();

	const now = new Date();

	try {
		// 1. Org.
		const orgId = await upsertOrganization(client, now);
		log(`✓ Organization "${ORG_NAME}" → ${orgId}`);

		// 2. Users + credential accounts.
		const dealerUserId = await upsertUser(client, DEALER_LOGIN, now);
		log(`✓ User ${DEALER_LOGIN.email} → ${dealerUserId}`);
		const collectorUserId = await upsertUser(client, COLLECTOR_LOGIN, now);
		log(`✓ User ${COLLECTOR_LOGIN.email} → ${collectorUserId}`);

		// 3. Memberships.
		await upsertMember(client, orgId, dealerUserId, "owner", now);
		log(`✓ Member: ${DEALER_LOGIN.email} (owner)`);
		await upsertMember(client, orgId, collectorUserId, "member", now);
		log(`✓ Member: ${COLLECTOR_LOGIN.email} (member)`);

		// 4. Find or create the dealer record. Prod has it from a prior
		//    iRadius sync (externalId 82095); local dev usually doesn't —
		//    we look up by username, fall back to creating a fresh row.
		const dealerId = await upsertDealer(client, orgId, dealerUserId, now);
		log(`✓ Dealer "${DEALER_USERNAME}" → ${dealerId}`);

		// 5. Org's active dealer. Skip silently if another dealer already
		//    holds the slot (would mean someone hand-pointed the org elsewhere).
		await client.query(
			`UPDATE organization
			 SET "activeDealerId" = $2
			 WHERE id = $1 AND ("activeDealerId" IS NULL OR "activeDealerId" = $2)`,
			[orgId, dealerId],
		);
		log(`✓ Organization activeDealerId → ${dealerId}`);

		// 6. Collector employee (with login).
		const collectorEmployeeId = await upsertCollector(
			client,
			orgId,
			dealerId,
			collectorUserId,
			now,
		);
		log(`✓ Employee colldanysleiman → ${collectorEmployeeId}`);

		// 7. Plans.
		const planMap = new Map<string, string>();
		for (const def of PLAN_DEFS) {
			const planId = await upsertPlan(client, orgId, dealerId, def, now);
			planMap.set(def.name, planId);
			log(`✓ Plan "${def.name}" → ${planId}`);
		}

		// 8. Customers.
		const accountNumberStart = await nextAccountNumber(client, orgId);
		let inserted = 0;
		let skipped = 0;
		let nextNum = accountNumberStart;

		for (const row of rows) {
			const username = blankIfUndefined(row.Username);
			if (!username) {
				skipped++;
				continue;
			}

			const exists = await client.query<{ id: string }>(
				`SELECT id FROM customer
				 WHERE "organizationId" = $1 AND username = $2 LIMIT 1`,
				[orgId, username],
			);
			if (exists.rowCount && exists.rowCount > 0) {
				skipped++;
				continue;
			}

			const planId = planMap.get(row.Service ?? "");
			if (!planId) {
				logError(
					`  ⚠ row ${username}: unknown plan ${JSON.stringify(row.Service)} — skipping`,
				);
				skipped++;
				continue;
			}

			const { first, last } = splitName(row.Name?.trim() || username);
			const { phones, mobile } = buildPhones(row.Mobile ?? null);
			const accountNumber = `ACC-${String(nextNum).padStart(5, "0")}`;
			nextNum++;

			await client.query(
				`INSERT INTO customer (
					id, "organizationId", "accountNumber", "firstName", "lastName",
					username, address, mobile, phones, status, "macAddress",
					"planId", "dealerId", "collectorId", "collectorName", "collectorPhone",
					"monthlyRate", balance, "expiresAt",
					"activatedAt", "createdAt", "updatedAt"
				) VALUES (
					$1, $2, $3, $4, $5,
					$6, $7, $8, $9::jsonb, $10::"CustomerStatus", $11,
					$12, $13, $14, $15, $16,
					$17, $18, $19,
					$20, $20, $20
				)`,
				[
					createId(),
					orgId,
					accountNumber,
					first || null,
					last,
					username,
					blankIfUndefined(row.Address),
					mobile,
					JSON.stringify(phones),
					statusFromBlocked(row.Blocked),
					parseMac(row["Mac Address"]),
					planId,
					dealerId,
					collectorEmployeeId,
					COLLECTOR_LOGIN.name,
					null,
					row["acount price"] ?? null,
					row.Balance ?? 0,
					parseDateOrNull(row.Expiry ?? null),
					parseDateOrNull(row["Date Created"] ?? null) ?? now,
				],
			);
			inserted++;
		}

		log(`\n✓ Customers: ${inserted} inserted, ${skipped} skipped`);
		log("\n🎉 Seed complete.");
		log(`\n  Org:       ${ORG_NAME} (slug ${ORG_SLUG})`);
		log(`  Dealer:    ${DEALER_LOGIN.email} / ${DEALER_LOGIN.password}`);
		log(
			`  Collector: ${COLLECTOR_LOGIN.email} / ${COLLECTOR_LOGIN.password}`,
		);
	} catch (error) {
		logError("\n❌ Seed failed:", error);
		process.exit(1);
	} finally {
		await client.end();
	}
}

// ── Helpers ──────────────────────────────────────────────────────

async function upsertOrganization(
	client: pg.Client,
	now: Date,
): Promise<string> {
	const existing = await client.query<{ id: string }>(
		"SELECT id FROM organization WHERE slug = $1",
		[ORG_SLUG],
	);
	if (existing.rows[0]) {
		return existing.rows[0].id;
	}
	const id = createId();
	await client.query(
		`INSERT INTO organization (id, name, slug, "createdAt")
		 VALUES ($1, $2, $3, $4)`,
		[id, ORG_NAME, ORG_SLUG, now],
	);
	return id;
}

async function upsertUser(
	client: pg.Client,
	def: { email: string; name: string; password: string; username?: string },
	now: Date,
): Promise<string> {
	const username = def.username?.toLowerCase() ?? null;
	const displayUsername = def.username ?? null;

	const existing = await client.query<{ id: string }>(
		`SELECT id FROM "user" WHERE email = $1`,
		[def.email],
	);
	if (existing.rows[0]) {
		if (username) {
			await client.query(
				`UPDATE "user"
				 SET username = COALESCE(username, $2),
				     "displayUsername" = COALESCE("displayUsername", $3)
				 WHERE id = $1`,
				[existing.rows[0].id, username, displayUsername],
			);
		}
		return existing.rows[0].id;
	}

	const userId = createId();
	await client.query(
		`INSERT INTO "user"
		   (id, name, email, "emailVerified", "createdAt", "updatedAt",
		    "onboardingComplete", username, "displayUsername")
		 VALUES ($1, $2, $3, true, $4, $4, true, $5, $6)`,
		[userId, def.name, def.email, now, username, displayUsername],
	);

	const passwordHash = hashPasswordSync(def.password);
	await client.query(
		`INSERT INTO account
		   (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
		 VALUES ($1, $2, 'credential', $3, $4, $5, $5)
		 ON CONFLICT ("providerId", "accountId") DO UPDATE SET
		   password = EXCLUDED.password,
		   "updatedAt" = EXCLUDED."updatedAt"`,
		[createId(), userId, userId, passwordHash, now],
	);
	return userId;
}

async function upsertMember(
	client: pg.Client,
	orgId: string,
	userId: string,
	role: string,
	now: Date,
): Promise<void> {
	const existing = await client.query<{ id: string }>(
		`SELECT id FROM member WHERE "organizationId" = $1 AND "userId" = $2`,
		[orgId, userId],
	);
	if (existing.rows[0]) {
		return;
	}
	await client.query(
		`INSERT INTO member (id, "organizationId", "userId", role, "createdAt")
		 VALUES ($1, $2, $3, $4, $5)`,
		[createId(), orgId, userId, role, now],
	);
}

async function upsertDealer(
	client: pg.Client,
	orgId: string,
	dealerUserId: string,
	now: Date,
): Promise<string> {
	const existing = await client.query<{
		id: string;
		organizationId: string | null;
		userId: string | null;
	}>(
		`SELECT id, "organizationId", "userId"
		 FROM isp_dealer WHERE username = $1`,
		[DEALER_USERNAME],
	);
	if (existing.rows[0]) {
		// Reuse the existing record. Fill in the org and user link if either
		// is still blank — leave them alone otherwise to avoid clobbering
		// admin-set values.
		await client.query(
			`UPDATE isp_dealer SET
			   "organizationId" = COALESCE("organizationId", $2),
			   "userId" = COALESCE("userId", $3),
			   "updatedAt" = $4
			 WHERE id = $1`,
			[existing.rows[0].id, orgId, dealerUserId, now],
		);
		return existing.rows[0].id;
	}

	// Fresh dealer (mostly the local-dev path; prod already has it).
	const id = createId();
	await client.query(
		`INSERT INTO isp_dealer (
			id, "organizationId", "userId", "externalId", username, name,
			status, "createdAt", "updatedAt"
		) VALUES (
			$1, $2, $3, $4, $5, $6,
			'ACTIVE'::"CustomerStatus", $7, $7
		)`,
		[
			id,
			orgId,
			dealerUserId,
			DEALER_IRADIUS_EXTERNAL_ID,
			DEALER_USERNAME,
			DEALER_DISPLAY_NAME,
			now,
		],
	);
	return id;
}

async function upsertCollector(
	client: pg.Client,
	orgId: string,
	dealerId: string,
	userId: string,
	now: Date,
): Promise<string> {
	const existing = await client.query<{ id: string }>(
		`SELECT id FROM employee
		 WHERE "organizationId" = $1 AND username = $2 LIMIT 1`,
		[orgId, COLLECTOR_LOGIN.username],
	);
	if (existing.rows[0]) {
		await client.query(
			`UPDATE employee SET
			   "userId" = COALESCE("userId", $2),
			   "dealerId" = COALESCE("dealerId", $3),
			   "updatedAt" = $4
			 WHERE id = $1`,
			[existing.rows[0].id, userId, dealerId, now],
		);
		return existing.rows[0].id;
	}

	const employeeNumber = await nextEmployeeNumber(client, orgId);
	const id = createId();
	await client.query(
		`INSERT INTO employee (
			id, "organizationId", "employeeNumber", name, username,
			email, department, status, "userId", "dealerId",
			preferred_layout, "createdAt", "updatedAt"
		) VALUES (
			$1, $2, $3, $4, $5,
			$6, 'BILLING'::"EmployeeDepartment",
			'ACTIVE'::"EmployeeStatus", $7, $8,
			'collector', $9, $9
		)`,
		[
			id,
			orgId,
			employeeNumber,
			COLLECTOR_LOGIN.name,
			COLLECTOR_LOGIN.username,
			COLLECTOR_LOGIN.email,
			userId,
			dealerId,
			now,
		],
	);
	return id;
}

async function upsertPlan(
	client: pg.Client,
	orgId: string,
	dealerId: string,
	def: (typeof PLAN_DEFS)[number],
	now: Date,
): Promise<string> {
	const existing = await client.query<{ id: string }>(
		`SELECT id FROM service_plan
		 WHERE "organizationId" = $1 AND name = $2 LIMIT 1`,
		[orgId, def.name],
	);
	if (existing.rows[0]) {
		return existing.rows[0].id;
	}
	const id = createId();
	await client.query(
		`INSERT INTO service_plan (
			id, "organizationId", name, "downloadSpeed", "uploadSpeed",
			"monthlyPrice", "monthlyQuota", "dealerId", "createdAt", "updatedAt"
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
		[
			id,
			orgId,
			def.name,
			def.downloadSpeed,
			def.uploadSpeed,
			def.monthlyPrice,
			def.monthlyQuota,
			dealerId,
			now,
		],
	);
	return id;
}

async function nextAccountNumber(
	client: pg.Client,
	orgId: string,
): Promise<number> {
	const result = await client.query<{ accountNumber: string }>(
		`SELECT "accountNumber" FROM customer
		 WHERE "organizationId" = $1 AND "accountNumber" LIKE 'ACC-%'`,
		[orgId],
	);
	const rows = result.rows as { accountNumber: string }[];
	const max = rows.reduce<number>((acc, r) => {
		const n = Number.parseInt(r.accountNumber.replace("ACC-", ""), 10);
		return Number.isFinite(n) && n > acc ? n : acc;
	}, 0);
	return max + 1;
}

async function nextEmployeeNumber(
	client: pg.Client,
	orgId: string,
): Promise<string> {
	const result = await client.query<{ employeeNumber: string }>(
		`SELECT "employeeNumber" FROM employee
		 WHERE "organizationId" = $1 AND "employeeNumber" LIKE 'EMP-%'`,
		[orgId],
	);
	const rows = result.rows as { employeeNumber: string }[];
	const max = rows.reduce<number>((acc, r) => {
		const n = Number.parseInt(r.employeeNumber.replace("EMP-", ""), 10);
		return Number.isFinite(n) && n > acc ? n : acc;
	}, 0);
	return `EMP-${String(max + 1).padStart(5, "0")}`;
}

main().catch(logError);
