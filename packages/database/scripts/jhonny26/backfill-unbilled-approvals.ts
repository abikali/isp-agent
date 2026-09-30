/**
 * One-off (D §0): charge the app-approved subscribers that were created in
 * iRadius while the charge servlet was missing (vendor redeploy 2026-09-16 →
 * 2026-09-30), then re-assert the expiry the approval intended.
 *
 * Why the re-assert: the native NEW USER charge adds a full period on top of
 * the current ExpiryAccount (BUG 3 in memory `iradius-create-subscriber.md`),
 * exactly like `createCustomerInIRadius` has to undo on every approval. The
 * intended value is the one in the user's own
 * "LibanCom App  Expiry set on approval  [Expiry Date = …]" UserLog row.
 *
 * Per user (idempotent — a second run skips everyone already charged):
 *   - skip when any UserBalance row exists (renewed / already charged since);
 *   - skip when an Invoice row exists without a UserBalance (e.g. 84632) — the
 *     charge's idempotency guard only checks UserBalance, so it would create a
 *     second Invoice; inspect by hand, then pass `--allow-invoice <id>`;
 *   - POST op=charge-new-user to the bridge, then
 *     UPDATE UserNas SET ExpiryAccount = <intended> + a UserLog op-2 line.
 *
 * Needs the bridge reinstalled first (GET IRADIUS_BRIDGE_URL answers 405).
 *
 * Run (dry, default):  node --import tsx scripts/jhonny26/backfill-unbilled-approvals.ts
 * Run (apply):         … backfill-unbilled-approvals.ts --apply [--allow-invoice 84632]
 * Prod:  docker exec <libancom-worker> sh -c \
 *          'cd /app/packages/database && node --import tsx scripts/jhonny26/backfill-unbilled-approvals.ts'
 */
// biome-ignore-all lint/suspicious/noConsole: operator script

import {
	executeIRadius,
	queryIRadius,
	withIRadiusConnection,
} from "../../lib/iradius";

/** Approved via the app with no UserBalance row since 2026-09-16 (spec D §0). */
const USER_IDS = [
	84567, 84574, 84583, 84584, 84585, 84589, 84603, 84609, 84632, 84634, 84638,
	84648, 84661, 84664,
];

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const allowInvoice = new Set(
	args
		.flatMap((a, i) => (a === "--allow-invoice" ? [args[i + 1]] : []))
		.map((v) => Number.parseInt(v ?? "", 10)),
);

async function charge(userId: number): Promise<void> {
	const url =
		process.env["IRADIUS_BRIDGE_URL"] || process.env["IRADIUS_CHARGE_URL"];
	const secret = process.env["IRADIUS_CHARGE_SECRET"];
	if (!url || !secret) {
		throw new Error("IRADIUS_BRIDGE_URL / IRADIUS_CHARGE_SECRET not set");
	}
	const res = await fetch(url, {
		method: "POST",
		headers: {
			"X-Charge-Secret": secret,
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: new URLSearchParams({
			op: "charge-new-user",
			userId: String(userId),
		}).toString(),
	});
	const text = await res.text();
	if (!res.ok || /"success"\s*:\s*false/.test(text)) {
		throw new Error(`charge failed (HTTP ${res.status}): ${text}`);
	}
}

async function main() {
	console.log(apply ? "APPLY mode" : "DRY RUN (pass --apply to write)");
	await withIRadiusConnection(async (conn) => {
		for (const userId of USER_IDS) {
			const [bal] = await queryIRadius(
				conn,
				"SELECT COUNT(*) AS n FROM UserBalance WHERE UserId = ?",
				[userId],
			);
			if (Number(bal?.["n"] ?? 0) > 0) {
				console.log(`${userId}: already has UserBalance — skip`);
				continue;
			}
			const [inv] = await queryIRadius(
				conn,
				"SELECT COUNT(*) AS n FROM Invoice WHERE UserId = ?",
				[userId],
			);
			if (Number(inv?.["n"] ?? 0) > 0 && !allowInvoice.has(userId)) {
				console.log(
					`${userId}: has ${String(inv?.["n"])} Invoice row(s) but no UserBalance — inspect by hand, then --allow-invoice ${userId}`,
				);
				continue;
			}
			const [log] = await queryIRadius(
				conn,
				`SELECT Description FROM UserLog
				 WHERE UserId = ? AND Description LIKE 'LibanCom App%Expiry set on approval%'
				 ORDER BY Id DESC LIMIT 1`,
				[userId],
			);
			const intended = /\[Expiry Date = ([^\]]+)\]/.exec(
				String(log?.["Description"] ?? ""),
			)?.[1];
			const [nas] = await queryIRadius(
				conn,
				"SELECT DATE_FORMAT(ExpiryAccount, '%Y-%m-%d %H:%i:%s') AS e FROM UserNas WHERE UserId = ?",
				[userId],
			);
			console.log(
				`${userId}: charge, then expiry ${String(nas?.["e"])} → ${intended ?? "(no approval log — keep the charged expiry)"}`,
			);
			if (!apply) {
				continue;
			}
			await charge(userId);
			if (intended) {
				await executeIRadius(
					conn,
					"UPDATE UserNas SET ExpiryAccount = ? WHERE UserId = ?",
					[intended, userId],
				);
				await executeIRadius(
					conn,
					`INSERT INTO UserLog (UserId, DealerId, UserName, OperationTypeId, Description, Logdate)
					 SELECT Id, ParentId, UserName, 2, ?, NOW() FROM User WHERE Id = ?`,
					[
						`LibanCom App  Expiry re-asserted after backfill charge  [Expiry Date = ${intended}]`,
						userId,
					],
				);
			}
			console.log(`${userId}: done`);
		}
	});
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
