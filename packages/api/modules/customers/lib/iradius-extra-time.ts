import type { IRadiusConnection } from "@repo/database/iradius";
import {
	executeIRadius,
	queryIRadius,
	toBooleanFromBit,
	withIRadiusConnection,
} from "@repo/database/iradius";
import { logger } from "@repo/logs";
import { beirutParts, beirutWallClockToUtc } from "@repo/utils";
import {
	beirutDateString,
	beirutEndOfDay,
	fromIRadiusDateTime,
} from "../../../lib/beirut-time";
import { DealerCreditError } from "../../dealers/lib/iradius-dealer";
import { round2 } from "../../dealers/lib/ledger";
import { iradiusForceDisconnect } from "./iradius-disconnect";

/**
 * Sanctioned iRadius write: add days to a subscriber's expiry and charge the
 * dealer the prorated wholesale price — "Align billing to the 1st".
 *
 * Replicates the legacy GWT "Add Day / Hour For Expiry Account" dialog with
 * "Manage Dealer Credit" ticked —
 * `AddTimeQuotaMgmt.addDayHourForExpiryAccount(manageDealerAccount=true,
 * adjustTime=false, addMode=true)`, read from bytecode on 2026-09-26 — in one
 * InnoDB transaction on the tunnelled connection:
 *
 *   SELECT User/UserNas/AccountType row                      … FOR UPDATE
 *   base    = ExpiryAccount, or NOW() when null / in the past
 *   days    = Beirut calendar days base → target
 *   dollars = round2(days·24·AccountType.Rate / periodHours)  (wholesale Rate)
 *   unless Dealer.NoCharge (DealerManagement.removeDealerCredit):
 *     SELECT Credit, NoCharge FROM Dealer WHERE UserId = ParentId FOR UPDATE
 *     refuse when dollars > Credit ("Not Ennough Credit To Renew This User.")
 *     UPDATE Dealer SET Credit = IFNULL(Credit,0) + (−dollars)
 *     SELECT Credit
 *     INSERT DealerBillingLog Type 'ADD EXTRA TIME', Debit dollars,
 *       Description 'Add  [ N Day(s)  ]  For ExpiryAccount For User : <name>
 *       - [Final Credit = <Float> ]'  (legacy shape, double spaces kept)
 *   UPDATE UserNas SET ExpiryAccount = 'YYYY-MM-DD 23:59:00'
 *   INSERT UserLog op 2 'LibanCom App  <reason>  [Expiry Date = …]'
 *
 * Differences from native, on purpose: the expiry is written as the target
 * literal (native writes base + days and the owner then fixes the time to
 * 23:59 by hand), and the RADIUS dictionary refresh ("5:"+user) cannot be
 * sent from our side. The charge never cascades commission and creates no
 * customer invoice — same as native. A lapsed subscriber is disconnected
 * after commit (native's MikroTik kick), best-effort.
 *
 * Idempotent: a retry finds the expiry already at the target and returns a
 * no-op, so the dealer is never charged twice.
 */

/** `ValidityPeriodTypeId` values (iRadius `SharedConst`; LibanCom plans are 1 = month, 2 = days). */
const CALENDAR_MONTH_PERIOD_ID = 1;
const DAYS_PERIOD_ID = 2;
const HOURS_PERIOD_ID = 3;
const MINUTES_PERIOD_ID = 4;

const HOUR_MS = 3_600_000;

/** Thrown when the target is earlier than the current expiry — this helper only adds days. */
export class ExtraTimePastTargetError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ExtraTimePastTargetError";
	}
}

function addBeirutWallClock(
	from: Date,
	add: { months?: number; days?: number },
): Date {
	const p = beirutParts(from);
	let year = p.year;
	let month = p.month + (add.months ?? 0);
	year += Math.floor((month - 1) / 12);
	month = ((((month - 1) % 12) + 12) % 12) + 1;
	// java.util.Calendar clamps the day to the target month's length.
	const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
	const day = Math.min(p.day, lastDay) + (add.days ?? 0);
	const shifted = new Date(Date.UTC(year, month - 1, day));
	const pad = (n: number) => String(n).padStart(2, "0");
	const wallClock = `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}T${pad(p.hour)}:${pad(p.minute)}`;
	const secondsMs = from.getTime() % 60_000;
	return new Date(beirutWallClockToUtc(wallClock).getTime() + secondsMs);
}

/**
 * `AccountTypeUtils.getExpiryAccount(now, ValidityPeriod, ValidityPeriodTypeId)`
 * minus now, floored to whole hours — the denominator native uses to prorate
 * the dealer's Rate (720h for a 30-day month, 744h for 31, ±1h across DST).
 * An unset period falls back to one calendar month (every LibanCom plan).
 */
export function periodHoursFrom(
	now: Date,
	validityPeriod: number | null,
	validityPeriodTypeId: number | null,
): number {
	const period = validityPeriod && validityPeriod > 0 ? validityPeriod : 1;
	let end: Date;
	if (validityPeriodTypeId === DAYS_PERIOD_ID) {
		end = addBeirutWallClock(now, { days: period });
	} else if (validityPeriodTypeId === HOURS_PERIOD_ID) {
		end = new Date(now.getTime() + period * HOUR_MS);
	} else if (validityPeriodTypeId === MINUTES_PERIOD_ID) {
		end = new Date(now.getTime() + period * 60_000);
	} else {
		// CALENDAR_MONTH_PERIOD_ID and anything unknown.
		end = addBeirutWallClock(now, {
			months:
				validityPeriodTypeId === CALENDAR_MONTH_PERIOD_ID ||
				!validityPeriodTypeId
					? period
					: 1,
		});
	}
	return Math.floor((end.getTime() - now.getTime()) / HOUR_MS);
}

/** Beirut calendar days from the day `from` falls on to `toDate` (`YYYY-MM-DD`). */
export function calendarDays(from: Date, toDate: string): number {
	const a = Date.parse(`${beirutDateString(from)}T00:00:00Z`);
	const b = Date.parse(`${toDate}T00:00:00Z`);
	return Math.round((b - a) / 86_400_000);
}

/** Native's prorated dealer charge: `days·24·Rate / periodHours`, 2 dp. */
export function dealerExtraTimeCharge(
	days: number,
	rate: number,
	periodHours: number,
): number {
	if (days <= 0 || periodHours <= 0 || !(rate > 0)) {
		return 0;
	}
	return round2((days * 24 * rate) / periodHours);
}

/** `String.valueOf(Float)` — how the legacy description prints Final Credit. */
export function javaFloatString(value: number): string {
	const f = Math.fround(value);
	if (f === 0) {
		return "0.0";
	}
	let digits = "";
	for (let precision = 1; precision <= 9; precision++) {
		const candidate = f.toPrecision(precision);
		if (Math.fround(Number(candidate)) === f) {
			digits = candidate;
			break;
		}
	}
	const n = Number(digits);
	const abs = Math.abs(n);
	if (abs >= 1e-3 && abs < 1e7) {
		const s = String(n);
		return s.includes(".") ? s : `${s}.0`;
	}
	const [mantissa = "0", exp = "0"] = n.toExponential().split("e");
	const m = mantissa.includes(".") ? mantissa : `${mantissa}.0`;
	return `${m}E${Number(exp)}`;
}

/** DealerBillingLog.Description exactly as native writes it. */
export function extraTimeDescription(
	days: number,
	userName: string,
	finalCredit: number,
): string {
	return `Add  [ ${days} Day(s)  ]  For ExpiryAccount For User : ${userName} - [Final Credit = ${javaFloatString(finalCredit)} ]`;
}

/** iRadius `QueryEngine.checkInjecttion` rejects these tokens; our text must never carry them. */
function assertNoInjectionTokens(text: string): void {
	if (/\b(CREATE|DROP)\s/i.test(text)) {
		throw new Error(
			`Refusing to write iRadius text containing a DDL token: ${text}`,
		);
	}
}

export interface ExtraTimeContext {
	userId: number;
	userName: string;
	parentId: number | null;
	expiryLiteral: string | null;
	validityPeriod: number | null;
	validityPeriodTypeId: number | null;
	/** AccountType.Rate — the wholesale monthly price the dealer pays. */
	rate: number;
	/** Null when the parent has no Dealer row (e.g. the admin). */
	dealerCredit: number | null;
	noCharge: boolean;
}

export interface ExtraTimePlan {
	oldExpiry: Date | null;
	base: Date;
	days: number;
	periodHours: number;
	/** What the dealer would be charged when charging is on (0 under NoCharge / no dealer). */
	dealerCharge: number;
	newExpiryLiteral: string;
	newExpiry: Date;
	/** The stored expiry already equals the target literal — nothing to do. */
	atTarget: boolean;
}

/** Pure planning step shared by the write and the read-only preview. */
export function planExtraTime(
	ctx: ExtraTimeContext,
	targetDate: string,
	now: Date,
): ExtraTimePlan {
	const target = beirutEndOfDay(targetDate);
	const oldExpiry = fromIRadiusDateTime(ctx.expiryLiteral);
	const base = oldExpiry && oldExpiry > now ? oldExpiry : now;
	const days = calendarDays(base, targetDate);
	const periodHours = periodHoursFrom(
		now,
		ctx.validityPeriod,
		ctx.validityPeriodTypeId,
	);
	const chargeable = ctx.dealerCredit !== null && !ctx.noCharge;
	return {
		oldExpiry,
		base,
		days,
		periodHours,
		dealerCharge: chargeable
			? dealerExtraTimeCharge(days, ctx.rate, periodHours)
			: 0,
		newExpiryLiteral: target.literal,
		newExpiry: target.utc,
		atTarget: ctx.expiryLiteral?.slice(0, 19) === target.literal,
	};
}

function requireUserId(externalId: string | null | undefined): number {
	const id = Number.parseInt(externalId ?? "", 10);
	if (!Number.isFinite(id) || id <= 0) {
		throw new Error("Customer is not linked to iRadius");
	}
	return id;
}

async function readContext(
	conn: IRadiusConnection,
	userId: number,
	lock: boolean,
): Promise<ExtraTimeContext> {
	const forUpdate = lock ? " FOR UPDATE" : "";
	const rows = await queryIRadius(
		conn,
		`SELECT u.Id, u.UserName, u.ParentId, n.ExpiryAccount, a.ValidityPeriod, a.ValidityPeriodTypeId, a.Rate
		 FROM UserNas n JOIN User u ON u.Id = n.UserId
		 LEFT JOIN AccountType a ON a.Id = n.AccountTypeId
		 WHERE n.UserId = ?${forUpdate}`,
		[userId],
	);
	const row = rows[0];
	if (!row) {
		throw new Error(`iRadius subscriber ${userId} not found`);
	}
	const parentId = row["ParentId"] == null ? null : Number(row["ParentId"]);
	let dealerCredit: number | null = null;
	let noCharge = false;
	if (parentId !== null) {
		const dealers = await queryIRadius(
			conn,
			`SELECT Credit, NoCharge FROM Dealer WHERE UserId = ?${forUpdate}`,
			[parentId],
		);
		const dealer = dealers[0];
		if (dealer) {
			dealerCredit = Number(dealer["Credit"] ?? 0);
			noCharge = toBooleanFromBit(dealer["NoCharge"]);
		}
	}
	const num = (v: unknown) => (v == null ? null : Number(v));
	return {
		userId,
		userName: String(row["UserName"] ?? ""),
		parentId,
		expiryLiteral:
			row["ExpiryAccount"] == null ? null : String(row["ExpiryAccount"]),
		validityPeriod: num(row["ValidityPeriod"]),
		validityPeriodTypeId: num(row["ValidityPeriodTypeId"]),
		rate: Number(row["Rate"] ?? 0),
		dealerCredit,
		noCharge,
	};
}

/** Read-only: what an add-days call would see right now (the dialog preview). */
export async function iradiusReadExtraTimeContext(
	externalId: string | null | undefined,
): Promise<ExtraTimeContext> {
	const userId = requireUserId(externalId);
	return withIRadiusConnection((conn) => readContext(conn, userId, false));
}

export interface AddExtraTimeParams {
	externalId: string | null | undefined;
	/** `YYYY-MM-DD`; the expiry becomes that day at 23:59 Beirut. */
	targetExpiry: string;
	chargeDealer: boolean;
	/** UserLog label; the helper appends the days and charge, e.g. "Aligned to 1st: +10 day(s), dealer charged $4.00". */
	reason: string;
}

export interface AddExtraTimeResult {
	changed: boolean;
	oldExpiry: Date | null;
	base: Date;
	days: number;
	dealerId: number | null;
	rate: number;
	periodHours: number;
	/** Actually debited — 0 when not charging, under NoCharge, or no dealer. */
	dealerCharge: number;
	finalCredit: number | null;
	newExpiryLiteral: string;
	newExpiry: Date;
}

/** The transaction body — exported for the statement-sequence tests. */
export async function addExtraTimeOnConnection(
	conn: IRadiusConnection,
	params: AddExtraTimeParams,
	now: Date,
): Promise<AddExtraTimeResult> {
	const userId = requireUserId(params.externalId);
	await conn.beginTransaction();
	try {
		const ctx = await readContext(conn, userId, true);
		const plan = planExtraTime(ctx, params.targetExpiry, now);
		const result: AddExtraTimeResult = {
			changed: false,
			oldExpiry: plan.oldExpiry,
			base: plan.base,
			days: plan.days,
			dealerId: ctx.parentId,
			rate: ctx.rate,
			periodHours: plan.periodHours,
			dealerCharge: 0,
			finalCredit: ctx.dealerCredit,
			newExpiryLiteral: plan.newExpiryLiteral,
			newExpiry: plan.newExpiry,
		};

		if (plan.atTarget) {
			await conn.commit();
			return result;
		}
		if (
			plan.days < 0 ||
			(plan.oldExpiry && plan.oldExpiry > plan.newExpiry)
		) {
			throw new ExtraTimePastTargetError(
				`The expiry (${ctx.expiryLiteral}) is already past ${plan.newExpiryLiteral}.`,
			);
		}

		const charge = params.chargeDealer ? plan.dealerCharge : 0;
		if (charge > 0 && ctx.parentId !== null && ctx.dealerCredit !== null) {
			if (charge > ctx.dealerCredit + 1e-6) {
				throw new DealerCreditError(
					`Not enough dealer credit: ${round2(ctx.dealerCredit)} left, ${charge} needed.`,
				);
			}
			await executeIRadius(
				conn,
				"UPDATE Dealer SET Credit = IFNULL(Credit, 0) + ? WHERE UserId = ?",
				[-charge, ctx.parentId],
			);
			const credit = await queryIRadius(
				conn,
				"SELECT Credit FROM Dealer WHERE UserId = ?",
				[ctx.parentId],
			);
			const finalCredit = Number(credit[0]?.["Credit"] ?? 0);
			const description = extraTimeDescription(
				plan.days,
				ctx.userName,
				finalCredit,
			);
			assertNoInjectionTokens(description);
			await executeIRadius(
				conn,
				`INSERT INTO DealerBillingLog (DealerId, UserId, NewExpiryDate, Type, Credit, Commission, Debit, CommissionDealerId, OperationDate, Description, ModifiedUserId)
				 VALUES (?, ?, ?, 'ADD EXTRA TIME', NULL, NULL, ?, NULL, NOW(), ?, ?)`,
				[
					ctx.parentId,
					userId,
					plan.newExpiryLiteral,
					charge,
					description,
					ctx.parentId,
				],
			);
			result.dealerCharge = charge;
			result.finalCredit = finalCredit;
		}

		const updated = await executeIRadius(
			conn,
			"UPDATE UserNas SET ExpiryAccount = ? WHERE UserId = ?",
			[plan.newExpiryLiteral, userId],
		);
		if (updated.affectedRows !== 1) {
			throw new Error(
				`Expected 1 UserNas row updated, got ${updated.affectedRows}`,
			);
		}

		const chargeText =
			result.dealerCharge > 0
				? `dealer charged $${result.dealerCharge.toFixed(2)}`
				: "dealer not charged";
		const logText = `LibanCom App  ${params.reason}: +${plan.days} day(s), ${chargeText}  [Expiry Date = ${plan.newExpiryLiteral}]`;
		assertNoInjectionTokens(logText);
		await executeIRadius(
			conn,
			`INSERT INTO UserLog (UserId, DealerId, UserName, OperationTypeId, Description, Logdate)
			 SELECT Id, ParentId, UserName, 2, ?, NOW() FROM User WHERE Id = ?`,
			[logText, userId],
		);

		await conn.commit();
		result.changed = true;
		return result;
	} catch (error) {
		await conn.rollback().catch((rollbackError) => {
			logger.error("[iRadius] add-extra-time rollback failed", {
				error: rollbackError,
			});
		});
		throw error;
	}
}

/**
 * Move a subscriber's expiry forward to `targetExpiry` 23:59 Beirut, charging
 * the dealer the prorated wholesale price when `chargeDealer`. Remote-first:
 * call it from `mirrorToIRadius`'s `remote` and write locally only on success.
 */
export async function iradiusAddExtraTime(
	params: AddExtraTimeParams,
): Promise<AddExtraTimeResult> {
	const now = new Date();
	const result = await withIRadiusConnection((conn) =>
		addExtraTimeOnConnection(conn, params, now),
	);
	// Native kicks a lapsed user off the NAS so the next login picks up the
	// new expiry. Best-effort: the expiry is already stored.
	if (result.changed && (!result.oldExpiry || result.oldExpiry < now)) {
		try {
			await iradiusForceDisconnect({
				externalId: params.externalId ?? null,
			});
		} catch (error) {
			logger.warn("iRadius disconnect after add-extra-time failed", {
				externalId: params.externalId,
				error: error instanceof Error ? error.message : error,
			});
		}
	}
	return result;
}
