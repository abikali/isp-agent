/**
 * Export a detailed CSV of every customer with iRadius + local signals
 * side-by-side, so the admin can decide what to do per-customer / per-dealer.
 *
 * Produces one row per customer (local OR iRadius-only). Columns give you
 * the full picture: identity, both-side statuses, expiry, login, payment
 * history, April-2026 invoice/payment state, and a recommendation.
 *
 * Read-only. Writes to /tmp/customer-analysis-YYYY-MM-DD.csv.
 *
 * Run:
 *   source .env && pnpm tsx packages/api/scripts/export-customer-analysis.ts
 */

// biome-ignore-all lint/suspicious/noConsole: CLI script

import { writeFileSync } from "node:fs";
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
}

type Classification =
	| "ACT_PAY"
	| "ACT_NEVER"
	| "IR_INACT_LOCAL_ACTIVE"
	| "IR_ARCH_LOCAL_ACTIVE"
	| "LOCAL_ACTIVE_NOT_IN_IRADIUS"
	| "BOTH_INACTIVE"
	| "LOCAL_INACTIVE_IR_ACTIVE"
	| "IRADIUS_ONLY"
	| "UNKNOWN";

interface Row {
	classification: Classification;
	recommendation: string;
	localId: string | null;
	externalId: string | null;
	username: string | null;
	firstName: string | null;
	lastName: string | null;
	mobile: string | null;
	phone: string | null;
	address: string | null;
	dealer: string | null;
	collector: string | null;
	plan: string | null;
	monthlyRate: number | null;
	groupName: string | null;
	localStatus: string | null;
	iradiusActive: boolean | null;
	iradiusArchived: boolean | null;
	iradiusBlocked: boolean | null;
	iradiusOnline: boolean | null;
	iradiusExpiresAt: Date | null;
	localExpiresAt: Date | null;
	lastLogin: Date | null;
	activatedAt: Date | null;
	paymentsTotalCount: number;
	paymentsSumAmount: number;
	lastPaidAt: Date | null;
	hasAprilInvoice: boolean;
	paidAprilViaNewSystem: boolean;
	notes: string;
}

function isoOrEmpty(d: Date | null | undefined): string {
	return d ? d.toISOString().slice(0, 10) : "";
}
function boolStr(v: boolean | null | undefined): string {
	if (v === null || v === undefined) {
		return "";
	}
	return v ? "yes" : "no";
}
function csvCell(v: unknown): string {
	if (v === null || v === undefined) {
		return "";
	}
	const s = typeof v === "string" ? v : String(v);
	if (
		s.includes(",") ||
		s.includes('"') ||
		s.includes("\n") ||
		s.includes("\r")
	) {
		return `"${s.replace(/"/g, '""')}"`;
	}
	return s;
}

function classify(
	local: {
		status: string;
		hasAnyPayment: boolean;
	} | null,
	iradius: IRadiusUser | null,
): Classification {
	if (!local && iradius) {
		return "IRADIUS_ONLY";
	}
	if (local && !iradius) {
		const localActive =
			local.status === "ACTIVE" || local.status === "PENDING";
		return localActive ? "LOCAL_ACTIVE_NOT_IN_IRADIUS" : "BOTH_INACTIVE";
	}
	if (!local || !iradius) {
		return "UNKNOWN";
	}
	const localActive = local.status === "ACTIVE" || local.status === "PENDING";
	const iradiusLive = iradius.iradiusActive && !iradius.iradiusArchived;
	if (iradius.iradiusArchived && localActive) {
		return "IR_ARCH_LOCAL_ACTIVE";
	}
	if (!iradius.iradiusActive && localActive) {
		return "IR_INACT_LOCAL_ACTIVE";
	}
	if (iradiusLive && !localActive) {
		return "LOCAL_INACTIVE_IR_ACTIVE";
	}
	if (iradiusLive && localActive) {
		return local.hasAnyPayment ? "ACT_PAY" : "ACT_NEVER";
	}
	return "BOTH_INACTIVE";
}

function recommend(c: Classification, paidAprilAlready: boolean): string {
	switch (c) {
		case "ACT_PAY":
			return paidAprilAlready
				? "Keep. Paying customer, April collected."
				: "Keep. Paying customer, awaiting April collection.";
		case "ACT_NEVER":
			return "Investigate. iRadius-active but no payment in new system. May be PHP-billed or truly dormant.";
		case "IR_INACT_LOCAL_ACTIVE":
			return "Flip local status → STOPPED. iRadius disabled them, we're out of sync.";
		case "IR_ARCH_LOCAL_ACTIVE":
			return "Flip local status → ARCHIVED. iRadius archived them, we're out of sync.";
		case "LOCAL_ACTIVE_NOT_IN_IRADIUS":
			return "Flip local status → ARCHIVED. iRadius deleted them entirely.";
		case "LOCAL_INACTIVE_IR_ACTIVE":
			return "Possible reactivation. iRadius has them active; investigate before re-enabling local billing.";
		case "BOTH_INACTIVE":
			return "Ignore. Both systems agree they're inactive.";
		case "IRADIUS_ONLY":
			return "Import to local. iRadius has a user we haven't synced.";
		case "UNKNOWN":
			return "Manual review.";
	}
}

async function main() {
	console.log("[export] Fetching iRadius users...");
	const iradiusRows = await withIRadiusConnection(async (conn) => {
		return queryIRadius(
			conn,
			`SELECT u.Id, u.UserName, u.Archived,
			        un.Active, un.Blocked, un.Online, un.ExpiryAccount
			 FROM User u
			 LEFT JOIN UserNas un ON un.UserId = u.Id
			 WHERE u.ProfileId = 4
			 ORDER BY u.Id`,
		);
	});
	console.log(`[export] ${iradiusRows.length} iRadius users.`);

	const iradiusByExt = new Map<string, IRadiusUser>();
	for (const r of iradiusRows) {
		const extId = String(r["Id"]);
		iradiusByExt.set(extId, {
			externalId: extId,
			userName: (r["UserName"] as string | null) ?? null,
			iradiusActive: toBooleanFromBit(r["Active"]),
			iradiusArchived: toBooleanFromBit(r["Archived"]),
			iradiusBlocked: toBooleanFromBit(r["Blocked"]),
			iradiusOnline: toBooleanFromBit(r["Online"]),
			iradiusExpiresAt: r["ExpiryAccount"]
				? new Date(r["ExpiryAccount"] as string)
				: null,
		});
	}

	console.log("[export] Fetching local customers (streamed aggregate)...");
	const customers = await db.customer.findMany({
		select: {
			id: true,
			externalId: true,
			username: true,
			firstName: true,
			lastName: true,
			mobile: true,
			phone: true,
			address: true,
			status: true,
			groupName: true,
			monthlyRate: true,
			expiresAt: true,
			lastLogin: true,
			activatedAt: true,
			dealer: { select: { name: true } },
			collector: { select: { name: true } },
			plan: { select: { name: true, monthlyPrice: true } },
			_count: { select: { payments: true } },
			payments: {
				select: {
					paidAmount: true,
					paidAt: true,
					billingMonth: { select: { year: true, month: true } },
				},
				orderBy: { paidAt: "desc" },
			},
			invoices: {
				where: { year: 2026, month: 4 },
				select: { id: true },
			},
		},
	});
	console.log(`[export] ${customers.length} local customers.`);

	const rows: Row[] = [];
	const seenExternalIds = new Set<string>();

	for (const c of customers) {
		const iradius = c.externalId ? iradiusByExt.get(c.externalId) : null;
		if (c.externalId) {
			seenExternalIds.add(c.externalId);
		}
		const hasAnyPayment = c._count.payments > 0;
		const classification = classify(
			{ status: c.status, hasAnyPayment },
			iradius ?? null,
		);
		const paidAprilAlready = c.payments.some(
			(p) => p.billingMonth.year === 2026 && p.billingMonth.month === 4,
		);
		const paymentsSum = c.payments.reduce(
			(sum, p) => sum + (p.paidAmount ?? 0),
			0,
		);
		const lastPaidAt = c.payments[0]?.paidAt ?? null;
		rows.push({
			classification,
			recommendation: recommend(classification, paidAprilAlready),
			localId: c.id,
			externalId: c.externalId,
			username: c.username,
			firstName: c.firstName,
			lastName: c.lastName,
			mobile: c.mobile,
			phone: c.phone,
			address: c.address,
			dealer: c.dealer?.name ?? null,
			collector: c.collector?.name ?? null,
			plan: c.plan?.name ?? null,
			monthlyRate: c.monthlyRate ?? c.plan?.monthlyPrice ?? null,
			groupName: c.groupName,
			localStatus: c.status,
			iradiusActive: iradius?.iradiusActive ?? null,
			iradiusArchived: iradius?.iradiusArchived ?? null,
			iradiusBlocked: iradius?.iradiusBlocked ?? null,
			iradiusOnline: iradius?.iradiusOnline ?? null,
			iradiusExpiresAt: iradius?.iradiusExpiresAt ?? null,
			localExpiresAt: c.expiresAt,
			lastLogin: c.lastLogin,
			activatedAt: c.activatedAt,
			paymentsTotalCount: c._count.payments,
			paymentsSumAmount: paymentsSum,
			lastPaidAt,
			hasAprilInvoice: c.invoices.length > 0,
			paidAprilViaNewSystem: paidAprilAlready,
			notes: !c.externalId
				? "no-externalId"
				: !iradius
					? "externalId not found in iRadius"
					: "",
		});
	}

	// Iradius-only users (not in local)
	for (const [extId, iru] of iradiusByExt) {
		if (seenExternalIds.has(extId)) {
			continue;
		}
		const classification: Classification = "IRADIUS_ONLY";
		rows.push({
			classification,
			recommendation: recommend(classification, false),
			localId: null,
			externalId: extId,
			username: iru.userName,
			firstName: null,
			lastName: null,
			mobile: null,
			phone: null,
			address: null,
			dealer: null,
			collector: null,
			plan: null,
			monthlyRate: null,
			groupName: null,
			localStatus: null,
			iradiusActive: iru.iradiusActive,
			iradiusArchived: iru.iradiusArchived,
			iradiusBlocked: iru.iradiusBlocked,
			iradiusOnline: iru.iradiusOnline,
			iradiusExpiresAt: iru.iradiusExpiresAt,
			localExpiresAt: null,
			lastLogin: null,
			activatedAt: null,
			paymentsTotalCount: 0,
			paymentsSumAmount: 0,
			lastPaidAt: null,
			hasAprilInvoice: false,
			paidAprilViaNewSystem: false,
			notes: "iRadius user with no local record",
		});
	}

	// ── Write CSV ──────────────────────────────────────────────────────
	const header = [
		"classification",
		"recommendation",
		"localId",
		"externalId",
		"username",
		"firstName",
		"lastName",
		"mobile",
		"phone",
		"address",
		"dealer",
		"collector",
		"plan",
		"monthlyRate",
		"groupName",
		"localStatus",
		"iradiusActive",
		"iradiusArchived",
		"iradiusBlocked",
		"iradiusOnline",
		"iradiusExpiresAt",
		"localExpiresAt",
		"lastLogin",
		"activatedAt",
		"paymentsTotalCount",
		"paymentsSumAmount",
		"lastPaidAt",
		"hasAprilInvoice",
		"paidAprilViaNewSystem",
		"notes",
	];

	const lines: string[] = [header.join(",")];
	for (const r of rows) {
		lines.push(
			[
				r.classification,
				r.recommendation,
				r.localId ?? "",
				r.externalId ?? "",
				r.username ?? "",
				r.firstName ?? "",
				r.lastName ?? "",
				r.mobile ?? "",
				r.phone ?? "",
				r.address ?? "",
				r.dealer ?? "",
				r.collector ?? "",
				r.plan ?? "",
				r.monthlyRate ?? "",
				r.groupName ?? "",
				r.localStatus ?? "",
				boolStr(r.iradiusActive),
				boolStr(r.iradiusArchived),
				boolStr(r.iradiusBlocked),
				boolStr(r.iradiusOnline),
				isoOrEmpty(r.iradiusExpiresAt),
				isoOrEmpty(r.localExpiresAt),
				isoOrEmpty(r.lastLogin),
				isoOrEmpty(r.activatedAt),
				r.paymentsTotalCount,
				r.paymentsSumAmount.toFixed(2),
				isoOrEmpty(r.lastPaidAt),
				boolStr(r.hasAprilInvoice),
				boolStr(r.paidAprilViaNewSystem),
				r.notes,
			]
				.map(csvCell)
				.join(","),
		);
	}

	const date = new Date().toISOString().slice(0, 10);
	const outPath = `/tmp/customer-analysis-${date}.csv`;
	writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");

	// Summary counts
	const byClass = new Map<string, number>();
	for (const r of rows) {
		byClass.set(r.classification, (byClass.get(r.classification) ?? 0) + 1);
	}
	console.log(`\n[export] Wrote ${rows.length} rows → ${outPath}`);
	console.log("[export] Breakdown by classification:");
	const sorted = [...byClass.entries()].sort((a, b) => b[1] - a[1]);
	for (const [k, v] of sorted) {
		console.log(`  ${k.padEnd(30)} ${String(v).padStart(6)}`);
	}
}

main()
	.catch((err) => {
		console.error("[export] FAILED:", err);
		process.exit(1);
	})
	.finally(async () => {
		await db.$disconnect();
	});
