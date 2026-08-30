/**
 * Wholesale revenue ingest — iRadius `DealerBillingLog` → local `DealerCharge`.
 *
 * ## Why this exists
 *
 * LibanCom runs two businesses. Retail subscribers are billed and collected
 * inside this app. Sub-dealers reselling the same network are billed entirely
 * inside iRadius, and until this sync existed, none of that revenue — roughly
 * $52,000 a month, about half the company's income — was visible here.
 *
 * Every COST of serving those dealers was already being reported (upstream
 * bandwidth serves all subscribers, dealers' included). Reporting all of the
 * cost and none of the matching revenue is what made a business earning ~$24k a
 * month appear to lose ~$34k a month.
 *
 * ## What is deliberately excluded
 *
 * Charges against the MASTER dealer. iRadius bills the operator for his own
 * subscribers at an internal transfer price (~$30k/month for Liban-Com). That
 * is one pocket paying another: it is neither revenue nor cost, and the retail
 * revenue for those same subscribers is already recognised from `Payment`.
 * Including it would roughly double the company's apparent income.
 *
 * Charges against dealers OUTSIDE this org's scope. Until 2026-08-30 this
 * module read the whole `DealerBillingLog` for every org and excluded only the
 * org's own master, which is the exact inverse of what was wanted: on
 * 2026-08-28 the dotnet2 org ingested all 89,483 rows — every dealer's charges
 * except its own, $408k of them Liban-Com's — and, because `externalId` was
 * then globally unique, permanently locked Liban-Com out of its own revenue.
 * See `resolveWholesaleScope` for what "in scope" means.
 *
 * ## Read-only contract
 *
 * iRadius is production and actively serving RADIUS auth. This module only ever
 * SELECTs. Column names were verified with DESCRIBE before use.
 */

import { db } from "@repo/database";
import type { IRadiusConnection } from "@repo/database/iradius";
import { queryIRadius } from "@repo/database/iradius";
import { logger } from "@repo/logs";

/** Rows are inserted in batches; iRadius returns tens of thousands per month. */
const BATCH_SIZE = 500;

/**
 * How far back to re-read on every sync.
 *
 * iRadius can back-date a correction, so a strictly-incremental watermark would
 * silently miss it. Re-reading a short trailing window and relying on the
 * `externalId` unique key to skip duplicates is cheap and self-healing.
 */
const OVERLAP_DAYS = 3;

export interface DealerChargeSyncResult {
	created: number;
	skipped: number;
	errors: number;
}

/**
 * Sync dealer charges for one organization.
 *
 * @param conn        open iRadius connection (SSH-tunnelled)
 * @param organizationId  org that owns the resulting rows
 * @param since       optional floor; defaults to the newest row already stored
 *                    minus the overlap window, or 13 months on a cold start
 */
export async function syncDealerCharges(
	conn: IRadiusConnection,
	organizationId: string,
	since?: Date,
): Promise<DealerChargeSyncResult> {
	const result: DealerChargeSyncResult = {
		created: 0,
		skipped: 0,
		errors: 0,
	};

	// Map iRadius dealer ids → local dealer rows. A charge whose dealer we do
	// not know about is skipped rather than guessed at.
	const dealers = await db.ispDealer.findMany({
		where: { externalId: { not: null } },
		select: { id: true, externalId: true, organizationId: true },
	});

	const dealerByExternalId = new Map(
		dealers.flatMap((d) => (d.externalId ? [[d.externalId, d]] : [])),
	);

	if (dealerByExternalId.size === 0) {
		logger.warn(
			"[Dealer charges] No dealers with an externalId — run the dealers-only sync first",
		);
		return result;
	}

	// The master dealer is the one this org operates as. Its own charges are
	// internal bookkeeping (see the file header) and must not become revenue.
	const org = await db.organization.findUnique({
		where: { id: organizationId },
		select: {
			isWholesaleOperator: true,
			activeDealer: { select: { externalId: true } },
		},
	});
	const masterExternalId = org?.activeDealer?.externalId ?? null;

	// Which dealers' charges are THIS org's revenue. Empty means the org
	// resells to nobody — it has no wholesale business, and ingesting anything
	// would be booking another org's money.
	const inScope = await resolveWholesaleScope(conn, {
		masterExternalId,
		isOperator: org?.isWholesaleOperator ?? false,
	});

	if (inScope.size === 0) {
		logger.info(
			"[Dealer charges] No dealers in scope for this org — nothing to ingest",
			{ organizationId, masterExternalId },
		);
		return result;
	}

	const from = since ?? (await resolveWatermark(organizationId));

	const rows = await queryIRadius(
		conn,
		`SELECT Id, DealerId, UserId, Type, Credit, Commission, Debit,
		        OperationDate, Description
		   FROM DealerBillingLog
		  WHERE OperationDate >= ?
		  ORDER BY OperationDate`,
		// queryIRadius takes primitives only; MySQL wants 'YYYY-MM-DD HH:MM:SS'.
		[from.toISOString().slice(0, 19).replace("T", " ")],
	);

	logger.info(
		`[Dealer charges] ${rows.length} rows from iRadius since ${from.toISOString()}`,
	);

	for (let i = 0; i < rows.length; i += BATCH_SIZE) {
		const batch = rows.slice(i, i + BATCH_SIZE);
		const data = [];

		for (const row of batch) {
			const externalDealerId = String(row["DealerId"] ?? "");
			const dealer = dealerByExternalId.get(externalDealerId);

			if (!dealer) {
				result.skipped++;
				continue;
			}

			// Another org's dealer, or the master's own internal transfer
			// price. `resolveWholesaleScope` has already removed the master
			// from the set, so this one check covers both.
			if (!inScope.has(externalDealerId)) {
				result.skipped++;
				continue;
			}

			const operationDate = row["OperationDate"]
				? new Date(row["OperationDate"] as string)
				: null;
			if (!operationDate || Number.isNaN(operationDate.getTime())) {
				result.skipped++;
				continue;
			}

			data.push({
				organizationId,
				dealerId: dealer.id,
				externalId: String(row["Id"]),
				type: String(row["Type"] ?? "UNKNOWN"),
				debit: Number(row["Debit"] ?? 0),
				credit: Number(row["Credit"] ?? 0),
				commission: Number(row["Commission"] ?? 0),
				externalUserId:
					row["UserId"] == null ? null : String(row["UserId"]),
				description:
					row["Description"] == null
						? null
						: String(row["Description"]),
				operationDate,
			});
		}

		if (data.length === 0) {
			continue;
		}

		try {
			const created = await db.dealerCharge.createMany({
				data,
				skipDuplicates: true,
			});
			result.created += created.count;
			result.skipped += data.length - created.count;
		} catch (error) {
			result.errors++;
			logger.error("[Dealer charges] Batch insert failed", {
				batch: Math.floor(i / BATCH_SIZE) + 1,
				error,
			});
		}
	}

	logger.info("[Dealer charges] Done", { ...result });
	return result;
}

/**
 * The iRadius dealers whose charges are this org's wholesale revenue.
 *
 * A charge is raised against the dealer being billed, so it is revenue for
 * whoever SELLS to that dealer — its parent. Hence:
 *
 *   - Dealers whose `User.ParentId` is the org's master are its resellers.
 *     This is the general case and the only one a reseller org ever hits.
 *   - The operator org additionally owns every top-level dealer
 *     (`ParentId = 1`, the iRadius admin account). iRadius models Liban-Com's
 *     resellers as siblings of its own `johnnyh` dealer rather than children
 *     of it, so there is no parent link to walk — `isWholesaleOperator` is
 *     what says "the admin level is mine". See the Organization model.
 *   - The master itself is always removed: iRadius bills it for its own
 *     subscribers at an internal transfer price (~$29.5k/month, verified
 *     against production 2026-08-30), which is not revenue.
 *
 * A dealer two levels down (bernardd under bernardk) is deliberately absent:
 * that charge is bernardk's revenue, not the operator's.
 */
async function resolveWholesaleScope(
	conn: IRadiusConnection,
	opts: { masterExternalId: string | null; isOperator: boolean },
): Promise<Set<string>> {
	const scope = new Set<string>();

	if (!opts.masterExternalId) {
		return scope;
	}

	const resellers = await queryIRadius(
		conn,
		"SELECT Id FROM User WHERE ProfileId = 2 AND ParentId = ?",
		[opts.masterExternalId],
	);
	for (const row of resellers) {
		scope.add(String(row["Id"]));
	}

	if (opts.isOperator) {
		const topLevel = await queryIRadius(
			conn,
			"SELECT Id FROM User WHERE ProfileId = 2 AND ParentId = 1",
		);
		for (const row of topLevel) {
			scope.add(String(row["Id"]));
		}
	}

	// Never the master's own charges, even if it sits at the admin level and
	// therefore came back in the operator query above.
	scope.delete(String(opts.masterExternalId));

	return scope;
}

/**
 * Where to resume from: the newest stored row minus the overlap window.
 * On a cold start, reach back far enough for a full year of history plus the
 * current partial month, so the trend chart is populated on day one.
 */
async function resolveWatermark(organizationId: string): Promise<Date> {
	const newest = await db.dealerCharge.findFirst({
		where: { organizationId },
		orderBy: { operationDate: "desc" },
		select: { operationDate: true },
	});

	if (!newest) {
		const cold = new Date();
		cold.setUTCMonth(cold.getUTCMonth() - 13);
		cold.setUTCDate(1);
		cold.setUTCHours(0, 0, 0, 0);
		return cold;
	}

	const resume = new Date(newest.operationDate);
	resume.setUTCDate(resume.getUTCDate() - OVERLAP_DAYS);
	return resume;
}
