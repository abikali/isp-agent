import type { IRadiusConnection } from "@repo/database/iradius";
import {
	executeIRadius,
	queryIRadius,
	withIRadiusConnection,
} from "@repo/database/iradius";
import { logger } from "@repo/logs";
import { round2 } from "./ledger";

/**
 * Sanctioned iRadius writes for dealer money.
 *
 * These are the ONLY places LibanCom mutates `Dealer.Credit`,
 * `DealerBillingLog` and `DealerAccount`. They replicate — statement for
 * statement — what the legacy GWT UI does in
 * `me.iradius.server.dealer.DealerConfiguration` (verified from bytecode on
 * 2026-09-02), so a row written here is indistinguishable from one the owner
 * typed into iRadius:
 *
 *   updateDealerCredit  →  UPDATE Dealer SET Credit = IFNULL(Credit,0) + X
 *                          INSERT DealerBillingLog (Type CREDIT|DEBIT,
 *                            Description "[note] - [Final Credit = Y ]")
 *                          manageDealerAccount(...)
 *   manageDealerAccount →  INSERT DealerAccount (Credit|Debit, Comment)
 *                          UPDATE that row's Balance =
 *                            Σcredit − Σdebit for the dealer
 *
 * All three tables are InnoDB, so each operation runs in one transaction on
 * the tunnelled connection: either every statement lands or none does.
 *
 * Remote-first contract (CLAUDE.md "Mirrored writes rule"): callers run these
 * BEFORE touching the local database and only mirror locally on success.
 */

/** iRadius `User.Id` of the built-in admin — what `ModifiedUserId` carries on
 *  every top-up the owner makes from the legacy UI. */
const IRADIUS_ADMIN_USER_ID = 1;

export class DealerCreditError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "DealerCreditError";
	}
}

function requireExternalId(dealer: { externalId?: string | null }): number {
	const id = Number(dealer.externalId);
	if (!dealer.externalId || !Number.isFinite(id)) {
		throw new DealerCreditError(
			"This dealer is not linked to iRadius, so its credit cannot be changed from here.",
		);
	}
	return id;
}

/** Java's `Double.toString` shape the legacy description uses: 17000.0, 1283.25 */
function formatLegacyCredit(value: number): string {
	const rounded = round2(value);
	return Number.isInteger(rounded) ? `${rounded}.0` : String(rounded);
}

/**
 * MySQL DATETIME literal in the iRadius server's wall clock (Beirut). The
 * server stamps its own rows with NOW() in local time, so a user-chosen date
 * must be written the same way or it lands three hours off.
 */
export function toIRadiusDateTime(date: Date): string {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Beirut",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	}).formatToParts(date);
	const get = (type: string) =>
		parts.find((p) => p.type === type)?.value ?? "00";
	const hour = get("hour") === "24" ? "00" : get("hour");
	return `${get("year")}-${get("month")}-${get("day")} ${hour}:${get("minute")}:${get("second")}`;
}

interface AccountEntry {
	credit: number | null;
	debit: number | null;
	/** null → the server's NOW() */
	operationDate: Date | null;
	comment: string | null;
}

/**
 * `DealerConfiguration.manageDealerAccount`: insert the ledger row, then stamp
 * it with the dealer's running balance the way iRadius does. The stamped
 * balance is what the legacy "Dealer Account" grid shows; our own readers
 * recompute it (see `lib/ledger.ts`).
 */
async function insertDealerAccountEntry(
	conn: IRadiusConnection,
	dealerExternalId: number,
	entry: AccountEntry,
): Promise<{ id: number; balance: number }> {
	const [result] = entry.operationDate
		? await conn.execute(
				"INSERT INTO DealerAccount (DealerId, Credit, Debit, OperationDate, Comment) VALUES (?, ?, ?, ?, ?)",
				[
					dealerExternalId,
					entry.credit,
					entry.debit,
					toIRadiusDateTime(entry.operationDate),
					entry.comment,
				],
			)
		: await conn.execute(
				"INSERT INTO DealerAccount (DealerId, Credit, Debit, OperationDate, Comment) VALUES (?, ?, ?, NOW(), ?)",
				[dealerExternalId, entry.credit, entry.debit, entry.comment],
			);
	const id = (result as { insertId?: number }).insertId;
	if (!id) {
		throw new Error(
			"iRadius did not return an id for the DealerAccount row",
		);
	}

	const rows = await queryIRadius(
		conn,
		"SELECT COALESCE(SUM(Credit),0) - COALESCE(SUM(Debit),0) AS Balance FROM DealerAccount WHERE DealerId = ?",
		[dealerExternalId],
	);
	const balance = round2(Number(rows[0]?.["Balance"] ?? 0));
	await executeIRadius(
		conn,
		"UPDATE DealerAccount SET Balance = ? WHERE Id = ?",
		[balance, id],
	);
	return { id, balance };
}

async function inTransaction<T>(
	conn: IRadiusConnection,
	fn: () => Promise<T>,
): Promise<T> {
	await conn.beginTransaction();
	try {
		const result = await fn();
		await conn.commit();
		return result;
	} catch (error) {
		await conn.rollback().catch((rollbackError) => {
			logger.error("[iRadius] dealer transaction rollback failed", {
				error: rollbackError,
			});
		});
		throw error;
	}
}

export interface AdjustCreditResult {
	/** `Dealer.Credit` after the change. */
	finalCredit: number;
	/** `DealerAccount.Id` of the ledger row — stored as the local externalId. */
	accountEntryId: number;
	/** Σcredit − Σdebit for the dealer after the change. */
	owed: number;
	operationDate: Date;
}

/**
 * Add prepaid credit to a dealer (`direction: "add"`) or take it back
 * (`"deduct"`). Adding credit is what the owner does when a dealer pays in
 * advance or is trusted for the month; it raises both the dealer's spendable
 * credit and what the dealer owes. Deducting reverses both.
 *
 * Refuses to deduct below zero — the legacy UI's "Not Ennough Credit" guard.
 *
 * @param note            free text; goes into the billing-log description
 *                        exactly where the legacy UI puts what the owner typed
 * @param ledgerComment   comment for the receivable ledger row (`DealerAccount`)
 */
export async function iradiusAdjustDealerCredit(
	dealer: { externalId?: string | null },
	params: {
		amount: number;
		direction: "add" | "deduct";
		note: string | null;
		ledgerComment: string | null;
	},
): Promise<AdjustCreditResult> {
	const dealerId = requireExternalId(dealer);
	const amount = round2(params.amount);
	if (!(amount > 0)) {
		throw new DealerCreditError("Amount must be greater than zero.");
	}

	return withIRadiusConnection((conn) =>
		inTransaction(conn, async () => {
			const rows = await queryIRadius(
				conn,
				"SELECT IFNULL(Credit, 0) AS Credit FROM Dealer WHERE UserId = ? FOR UPDATE",
				[dealerId],
			);
			const row = rows[0];
			if (!row) {
				throw new DealerCreditError("Dealer not found in iRadius.");
			}
			const current = Number(row["Credit"]);

			if (params.direction === "deduct" && current + 1e-6 < amount) {
				throw new DealerCreditError(
					`The dealer only has ${formatLegacyCredit(current)} credit left, so ${formatLegacyCredit(amount)} cannot be deducted.`,
				);
			}

			const delta = params.direction === "add" ? amount : -amount;
			await executeIRadius(
				conn,
				"UPDATE Dealer SET Credit = IFNULL(Credit, 0) + ? WHERE UserId = ?",
				[delta, dealerId],
			);
			const finalCredit = round2(current + delta);

			const description = `[${params.note ?? ""}] - [Final Credit = ${formatLegacyCredit(finalCredit)} ]`;
			await executeIRadius(
				conn,
				"INSERT INTO DealerBillingLog (DealerId, Type, Credit, Debit, OperationDate, Description, ModifiedUserId) VALUES (?, ?, ?, ?, NOW(), ?, ?)",
				[
					dealerId,
					params.direction === "add" ? "CREDIT" : "DEBIT",
					params.direction === "add" ? amount : null,
					params.direction === "add" ? null : amount,
					description,
					IRADIUS_ADMIN_USER_ID,
				],
			);

			const operationDate = new Date();
			const entry = await insertDealerAccountEntry(conn, dealerId, {
				credit: params.direction === "add" ? amount : null,
				debit: params.direction === "add" ? null : amount,
				operationDate: null,
				comment: params.ledgerComment,
			});

			return {
				finalCredit,
				accountEntryId: entry.id,
				owed: entry.balance,
				operationDate,
			};
		}),
	);
}

export interface RecordPaymentResult {
	accountEntryId: number;
	owed: number;
}

/**
 * Record money coming back from a dealer — cash, a write-off, goods in kind.
 * Legacy `updateDealerCreditDebit`: a `DealerAccount` debit row only; the
 * dealer's spendable credit is untouched.
 */
export async function iradiusRecordDealerPayment(
	dealer: { externalId?: string | null },
	params: { amount: number; operationDate: Date; comment: string | null },
): Promise<RecordPaymentResult> {
	const dealerId = requireExternalId(dealer);
	const amount = round2(params.amount);
	if (!(amount > 0)) {
		throw new DealerCreditError("Amount must be greater than zero.");
	}

	return withIRadiusConnection((conn) =>
		inTransaction(conn, async () => {
			const entry = await insertDealerAccountEntry(conn, dealerId, {
				credit: null,
				debit: amount,
				operationDate: params.operationDate,
				comment: params.comment,
			});
			return { accountEntryId: entry.id, owed: entry.balance };
		}),
	);
}
