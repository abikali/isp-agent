/**
 * Compare customer status between iRadius and our local DB.
 *
 * Answers:
 *   - Who is Active on iRadius but we never bill / never see paid?
 *   - Who is marked STOPPED/ARCHIVED locally but still Active on iRadius?
 *   - Who has April invoice locally but is actually inactive on iRadius?
 *   - Who is Active on iRadius but has no April invoice?
 *   - Dealer-level breakdown so we can target cleanups per dealer.
 *
 * Read-only on iRadius (never mutates). Writes nothing to local DB.
 *
 * Run:
 *   source .env && pnpm tsx packages/api/scripts/compare-iradius-status.ts
 */

// biome-ignore-all lint/suspicious/noConsole: CLI script

import { db } from "@repo/database";
import {
	queryIRadius,
	toBooleanFromBit,
	withIRadiusConnection,
} from "@repo/database/iradius";

interface IRadiusUser {
	externalId: string;
	userName: string | null;
	iradiusActive: boolean;
	iradiusArchived: boolean;
	iradiusBlocked: boolean;
	iradiusOnline: boolean;
	iradiusExpiresAt: Date | null;
	iradiusParentId: number | null;
}

interface LocalCustomer {
	id: string;
	externalId: string | null;
	status: string;
	dealerId: string | null;
	dealerName: string | null;
	lastLogin: Date | null;
	hasAnyPayment: boolean;
	hasAprilInvoice: boolean;
	paidApril: boolean;
}

type Bucket = {
	active_iradius_paying: number;
	active_iradius_never_paid: number;
	active_iradius_no_april_invoice: number;
	inactive_iradius_but_active_local: number;
	archived_iradius_but_active_local: number;
	active_local_not_in_iradius: number;
	both_inactive: number;
};

function emptyBucket(): Bucket {
	return {
		active_iradius_paying: 0,
		active_iradius_never_paid: 0,
		active_iradius_no_april_invoice: 0,
		inactive_iradius_but_active_local: 0,
		archived_iradius_but_active_local: 0,
		active_local_not_in_iradius: 0,
		both_inactive: 0,
	};
}

async function main() {
	// ── Fetch iRadius customers (ProfileId=4 = end users) ──────────────
	console.log("[compare] Connecting to iRadius...");
	const iradiusRows = await withIRadiusConnection(async (conn) => {
		return queryIRadius(
			conn,
			`SELECT u.Id, u.UserName, u.Archived, u.ParentId,
			        un.Active, un.Blocked, un.Online, un.ExpiryAccount
			 FROM User u
			 LEFT JOIN UserNas un ON un.UserId = u.Id
			 WHERE u.ProfileId = 4
			 ORDER BY u.Id`,
		);
	});
	console.log(`[compare] Fetched ${iradiusRows.length} iRadius users.`);

	const iradiusByExt = new Map<string, IRadiusUser>();
	for (const row of iradiusRows) {
		const extId = String(row["Id"]);
		iradiusByExt.set(extId, {
			externalId: extId,
			userName: (row["UserName"] as string | null) ?? null,
			iradiusActive: toBooleanFromBit(row["Active"]),
			iradiusArchived: toBooleanFromBit(row["Archived"]),
			iradiusBlocked: toBooleanFromBit(row["Blocked"]),
			iradiusOnline: toBooleanFromBit(row["Online"]),
			iradiusExpiresAt: row["ExpiryAccount"]
				? new Date(row["ExpiryAccount"] as string)
				: null,
			iradiusParentId: (row["ParentId"] as number | null) ?? null,
		});
	}

	// ── Fetch local customers + billing signals ─────────────────────────
	console.log("[compare] Reading local DB...");
	const localCustomers = await db.customer.findMany({
		select: {
			id: true,
			externalId: true,
			status: true,
			dealerId: true,
			lastLogin: true,
			dealer: { select: { name: true } },
			_count: { select: { payments: true } },
			invoices: {
				where: { year: 2026, month: 4 },
				select: { id: true },
			},
			payments: {
				where: {
					billingMonth: { year: 2026, month: 4 },
				},
				select: { id: true },
			},
		},
	});
	console.log(`[compare] Fetched ${localCustomers.length} local customers.`);

	const localByExt = new Map<string, LocalCustomer>();
	const localWithoutExt: LocalCustomer[] = [];
	for (const c of localCustomers) {
		const row: LocalCustomer = {
			id: c.id,
			externalId: c.externalId,
			status: c.status,
			dealerId: c.dealerId,
			dealerName: c.dealer?.name ?? null,
			lastLogin: c.lastLogin,
			hasAnyPayment: c._count.payments > 0,
			hasAprilInvoice: c.invoices.length > 0,
			paidApril: c.payments.length > 0,
		};
		if (c.externalId) {
			localByExt.set(c.externalId, row);
		} else {
			localWithoutExt.push(row);
		}
	}

	// ── Compare ────────────────────────────────────────────────────────
	console.log("[compare] Computing cross-tab...\n");

	const perDealer = new Map<string, Bucket>();
	function bucket(name: string): Bucket {
		let b = perDealer.get(name);
		if (!b) {
			b = emptyBucket();
			perDealer.set(name, b);
		}
		return b;
	}

	const orphansInIRadius: IRadiusUser[] = [];

	for (const [extId, iru] of iradiusByExt) {
		const local = localByExt.get(extId);
		const dealerName = local?.dealerName ?? "(no local record)";
		const b = bucket(dealerName);

		if (!local) {
			orphansInIRadius.push(iru);
			continue;
		}
		const localActive =
			local.status === "ACTIVE" || local.status === "PENDING";

		if (iru.iradiusArchived) {
			if (localActive) {
				b.archived_iradius_but_active_local++;
			} else {
				b.both_inactive++;
			}
			continue;
		}

		if (!iru.iradiusActive) {
			if (localActive) {
				b.inactive_iradius_but_active_local++;
			} else {
				b.both_inactive++;
			}
			continue;
		}

		// iRadius active from here on
		if (local.hasAnyPayment) {
			b.active_iradius_paying++;
		} else {
			b.active_iradius_never_paid++;
		}
		if (!local.hasAprilInvoice) {
			b.active_iradius_no_april_invoice++;
		}
	}

	// Local customers with externalId pointing to nothing in iRadius
	let localNotInIRadius = 0;
	let localActiveNotInIRadius = 0;
	for (const [extId, lc] of localByExt) {
		if (!iradiusByExt.has(extId)) {
			localNotInIRadius++;
			if (lc.status === "ACTIVE" || lc.status === "PENDING") {
				localActiveNotInIRadius++;
				const b = bucket(lc.dealerName ?? "(unknown dealer)");
				b.active_local_not_in_iradius++;
			}
		}
	}

	// ── Print report ──────────────────────────────────────────────────
	console.log("=".repeat(80));
	console.log("                      iRADIUS vs LOCAL COMPARISON");
	console.log("=".repeat(80));

	console.log(
		`\niRadius users (ProfileId=4):           ${iradiusRows.length}`,
	);
	console.log(
		`Local customers:                        ${localCustomers.length}`,
	);
	console.log(`  with externalId linked:               ${localByExt.size}`);
	console.log(
		`  no externalId (local-only):           ${localWithoutExt.length}`,
	);
	console.log(
		`  externalId points to missing iRadius: ${localNotInIRadius} (${localActiveNotInIRadius} still ACTIVE locally)`,
	);
	console.log(
		`iRadius users with no local match:     ${orphansInIRadius.length}`,
	);

	console.log(`\n${"=".repeat(80)}`);
	console.log("                   PER-DEALER BREAKDOWN");
	console.log("=".repeat(80));
	console.log("\n  Col abbreviations:");
	console.log(
		"    ACT_PAY   = active on iRadius AND has paid at least once locally",
	);
	console.log("    ACT_NEVER = active on iRadius AND never paid locally");
	console.log(
		"    NO_INV    = active on iRadius but no April invoice in our DB",
	);
	console.log(
		"    IR_INACT  = iRadius Active=0, but we still have them ACTIVE locally",
	);
	console.log(
		"    IR_ARCH   = iRadius Archived=1, but we still have them ACTIVE locally",
	);
	console.log(
		"    LCL_ONLY  = ACTIVE locally, externalId not found in iRadius",
	);
	console.log("    BOTH_OFF  = inactive on both sides\n");

	function activeCount(b: Bucket) {
		return b.active_iradius_paying + b.active_iradius_never_paid;
	}
	const dealerNames = [...perDealer.keys()].sort((a, b) => {
		const ab = perDealer.get(a);
		const bb = perDealer.get(b);
		if (!ab || !bb) {
			return 0;
		}
		return activeCount(bb) - activeCount(ab);
	});

	const h = (label: string, w: number): string => label.padStart(w, " ");
	const header = [
		"DEALER".padEnd(28),
		h("ACT_PAY", 8),
		h("ACT_NEVER", 10),
		h("NO_INV", 8),
		h("IR_INACT", 9),
		h("IR_ARCH", 9),
		h("LCL_ONLY", 9),
		h("BOTH_OFF", 9),
	].join("  ");
	console.log(header);
	console.log("-".repeat(header.length));

	for (const name of dealerNames) {
		const b = perDealer.get(name);
		if (!b) {
			continue;
		}
		console.log(
			[
				name.slice(0, 28).padEnd(28),
				h(String(b.active_iradius_paying), 8),
				h(String(b.active_iradius_never_paid), 10),
				h(String(b.active_iradius_no_april_invoice), 8),
				h(String(b.inactive_iradius_but_active_local), 9),
				h(String(b.archived_iradius_but_active_local), 9),
				h(String(b.active_local_not_in_iradius), 9),
				h(String(b.both_inactive), 9),
			].join("  "),
		);
	}

	// Totals
	const totals = emptyBucket();
	for (const b of perDealer.values()) {
		totals.active_iradius_paying += b.active_iradius_paying;
		totals.active_iradius_never_paid += b.active_iradius_never_paid;
		totals.active_iradius_no_april_invoice +=
			b.active_iradius_no_april_invoice;
		totals.inactive_iradius_but_active_local +=
			b.inactive_iradius_but_active_local;
		totals.archived_iradius_but_active_local +=
			b.archived_iradius_but_active_local;
		totals.active_local_not_in_iradius += b.active_local_not_in_iradius;
		totals.both_inactive += b.both_inactive;
	}
	console.log("-".repeat(header.length));
	console.log(
		[
			"TOTAL".padEnd(28),
			h(String(totals.active_iradius_paying), 8),
			h(String(totals.active_iradius_never_paid), 10),
			h(String(totals.active_iradius_no_april_invoice), 8),
			h(String(totals.inactive_iradius_but_active_local), 9),
			h(String(totals.archived_iradius_but_active_local), 9),
			h(String(totals.active_local_not_in_iradius), 9),
			h(String(totals.both_inactive), 9),
		].join("  "),
	);

	console.log(`\n${"=".repeat(80)}`);
	console.log("                   INVOICE / COLLECTION MISMATCHES");
	console.log("=".repeat(80));

	let invoiceButInactiveOnIradius = 0;
	let noInvoiceButActiveOnIradius = 0;
	let paidButInactiveOnIradius = 0;

	for (const [extId, lc] of localByExt) {
		const iru = iradiusByExt.get(extId);
		if (!iru) {
			continue;
		}

		const iradiusLive = iru.iradiusActive && !iru.iradiusArchived;

		if (lc.hasAprilInvoice && !iradiusLive) {
			invoiceButInactiveOnIradius++;
		}
		if (!lc.hasAprilInvoice && iradiusLive && !lc.hasAnyPayment) {
			noInvoiceButActiveOnIradius++;
		}
		if (lc.paidApril && !iradiusLive) {
			paidButInactiveOnIradius++;
		}
	}

	console.log(
		`\n  April invoice exists BUT iRadius says inactive/archived: ${invoiceButInactiveOnIradius}`,
	);
	console.log(
		"    (deletion candidates; next-month's generator should skip these)",
	);
	console.log(
		`\n  iRadius active BUT no April invoice AND never paid:      ${noInvoiceButActiveOnIradius}`,
	);
	console.log(
		"    (possible legitimate customers we dropped; inspect before re-billing)",
	);
	console.log(
		`\n  Paid April BUT iRadius now says inactive/archived:       ${paidButInactiveOnIradius}`,
	);
	console.log(
		"    (normal — stopped-account collections or post-payment disconnects)",
	);

	console.log(`\n${"=".repeat(80)}`);
	console.log("Done.");
}

main()
	.catch((err) => {
		console.error("[compare] FAILED:", err);
		process.exit(1);
	})
	.finally(async () => {
		await db.$disconnect();
	});
