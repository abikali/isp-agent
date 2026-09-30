import type { IRadiusConnection } from "@repo/database/iradius";
import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/iradius-disconnect", () => ({
	iradiusForceDisconnect: vi.fn(),
}));

import { DealerCreditError } from "../../dealers/lib/iradius-dealer";
import {
	addExtraTimeOnConnection,
	ExtraTimePastTargetError,
	extraTimeDescription,
	javaFloatString,
} from "../lib/iradius-extra-time";

interface Call {
	kind: "query" | "execute" | "begin" | "commit" | "rollback";
	sql?: string;
	params?: unknown[];
}

interface Fixture {
	expiry: string | null;
	rate?: number;
	credit?: number;
	noCharge?: boolean;
	/** Credit the SELECT after the debit returns. */
	finalCredit?: number;
	dealerRow?: boolean;
}

/** A fake mysql2 connection that records every statement. */
function fakeConnection(f: Fixture) {
	const calls: Call[] = [];
	const conn = {
		query: vi.fn(async (sql: string, params?: unknown[]) => {
			calls.push({ kind: "query", sql, params });
			if (sql.includes("FROM UserNas")) {
				return [
					[
						{
							Id: 66395,
							UserName: "elsyaon",
							ParentId: 53853,
							ExpiryAccount: f.expiry,
							ValidityPeriod: 1,
							ValidityPeriodTypeId: 1,
							Rate: f.rate ?? 12,
						},
					],
				];
			}
			if (sql.includes("Credit, NoCharge")) {
				return [
					f.dealerRow === false
						? []
						: [
								{
									Credit: f.credit ?? 100,
									NoCharge: f.noCharge ? 1 : 0,
								},
							],
				];
			}
			if (sql.startsWith("SELECT Credit FROM Dealer")) {
				return [[{ Credit: f.finalCredit ?? 96 }]];
			}
			return [[]];
		}),
		execute: vi.fn(async (sql: string, params?: unknown[]) => {
			calls.push({ kind: "execute", sql, params });
			return [{ affectedRows: 1 }];
		}),
		beginTransaction: vi.fn(async () => {
			calls.push({ kind: "begin" });
		}),
		commit: vi.fn(async () => {
			calls.push({ kind: "commit" });
		}),
		rollback: vi.fn(async () => {
			calls.push({ kind: "rollback" });
		}),
	};
	return { conn: conn as unknown as IRadiusConnection, calls };
}

/** 2026-09-21 12:06 Beirut — when Jhonny aligned elsyaon. */
const NOW = new Date("2026-09-21T09:06:00Z");

const params = {
	externalId: "66395",
	targetExpiry: "2026-10-01",
	chargeDealer: true,
	reason: "Aligned to 1st",
};

function executed(calls: Call[]) {
	return calls
		.filter((c) => c.kind === "execute")
		.map((c) => c.sql?.replace(/\s+/g, " ").trim());
}

describe("addExtraTimeOnConnection", () => {
	it("charges the dealer the prorated Rate and moves the expiry (elsyaon, DBL 448381)", async () => {
		const { conn, calls } = fakeConnection({
			expiry: "2026-05-05 23:59:00",
		});
		const result = await addExtraTimeOnConnection(conn, params, NOW);

		expect(result).toMatchObject({
			changed: true,
			days: 10,
			periodHours: 720,
			dealerCharge: 4,
			finalCredit: 96,
			dealerId: 53853,
			newExpiryLiteral: "2026-10-01 23:59:00",
		});
		expect(calls[0]?.kind).toBe("begin");
		expect(calls.at(-1)?.kind).toBe("commit");
		expect(calls[1]?.sql).toMatch(/FROM UserNas[\s\S]*FOR UPDATE$/);
		expect(calls[2]?.sql).toMatch(
			/Credit, NoCharge FROM Dealer.*FOR UPDATE/,
		);

		expect(executed(calls)).toEqual([
			"UPDATE Dealer SET Credit = IFNULL(Credit, 0) + ? WHERE UserId = ?",
			"INSERT INTO DealerBillingLog (DealerId, UserId, NewExpiryDate, Type, Credit, Commission, Debit, CommissionDealerId, OperationDate, Description, ModifiedUserId) VALUES (?, ?, ?, 'ADD EXTRA TIME', NULL, NULL, ?, NULL, NOW(), ?, ?)",
			"UPDATE UserNas SET ExpiryAccount = ? WHERE UserId = ?",
			"INSERT INTO UserLog (UserId, DealerId, UserName, OperationTypeId, Description, Logdate) SELECT Id, ParentId, UserName, 2, ?, NOW() FROM User WHERE Id = ?",
		]);
		const execs = calls.filter((c) => c.kind === "execute");
		expect(execs[0]?.params).toEqual([-4, 53853]);
		expect(execs[1]?.params).toEqual([
			53853,
			66395,
			"2026-10-01 23:59:00",
			4,
			"Add  [ 10 Day(s)  ]  For ExpiryAccount For User : elsyaon - [Final Credit = 96.0 ]",
			53853,
		]);
		expect(execs[2]?.params).toEqual(["2026-10-01 23:59:00", 66395]);
		expect(execs[3]?.params).toEqual([
			"LibanCom App  Aligned to 1st: +10 day(s), dealer charged $4.00  [Expiry Date = 2026-10-01 23:59:00]",
			66395,
		]);
	});

	it("skips the charge (no billing-log row) when the dealer is NoCharge", async () => {
		const { conn, calls } = fakeConnection({
			expiry: "2026-05-05 23:59:00",
			noCharge: true,
		});
		const result = await addExtraTimeOnConnection(conn, params, NOW);
		expect(result.dealerCharge).toBe(0);
		expect(result.changed).toBe(true);
		const sqls = executed(calls);
		expect(sqls.some((s) => s?.includes("Dealer SET"))).toBe(false);
		expect(sqls.some((s) => s?.includes("DealerBillingLog"))).toBe(false);
		expect(sqls[0]).toContain("UPDATE UserNas");
	});

	it("does not charge when chargeDealer is off (free days)", async () => {
		const { conn, calls } = fakeConnection({
			expiry: "2026-05-05 23:59:00",
		});
		const result = await addExtraTimeOnConnection(
			conn,
			{ ...params, chargeDealer: false },
			NOW,
		);
		expect(result.dealerCharge).toBe(0);
		expect(executed(calls)).toHaveLength(2);
		const log = calls.filter((c) => c.kind === "execute")[1]?.params?.[0];
		expect(log).toContain("dealer not charged");
	});

	it("refuses and rolls back when the dealer lacks credit", async () => {
		const { conn, calls } = fakeConnection({
			expiry: "2026-05-05 23:59:00",
			credit: 3.5,
		});
		await expect(
			addExtraTimeOnConnection(conn, params, NOW),
		).rejects.toBeInstanceOf(DealerCreditError);
		expect(executed(calls)).toEqual([]);
		expect(calls.at(-1)?.kind).toBe("rollback");
	});

	it("is a no-op when the expiry already sits on the target (retry-safe)", async () => {
		const { conn, calls } = fakeConnection({
			expiry: "2026-10-01 23:59:00",
		});
		const result = await addExtraTimeOnConnection(conn, params, NOW);
		expect(result.changed).toBe(false);
		expect(result.dealerCharge).toBe(0);
		expect(executed(calls)).toEqual([]);
		expect(calls.at(-1)?.kind).toBe("commit");
	});

	it("fixes the time without charging when 0 days are added", async () => {
		// Native +10d on 09-21 12:06 left 10-01 12:06; aligning writes 23:59.
		const { conn, calls } = fakeConnection({
			expiry: "2026-10-01 12:06:00",
		});
		const result = await addExtraTimeOnConnection(conn, params, NOW);
		expect(result).toMatchObject({
			changed: true,
			days: 0,
			dealerCharge: 0,
		});
		expect(executed(calls)[0]).toContain("UPDATE UserNas");
	});

	it("refuses to move an expiry backwards", async () => {
		const { conn, calls } = fakeConnection({
			expiry: "2026-10-05 23:59:00",
		});
		await expect(
			addExtraTimeOnConnection(conn, params, NOW),
		).rejects.toBeInstanceOf(ExtraTimePastTargetError);
		expect(executed(calls)).toEqual([]);
	});
});

describe("legacy text shapes", () => {
	it("prints Final Credit like Java's Float.toString", () => {
		expect(javaFloatString(96)).toBe("96.0");
		expect(javaFloatString(123412.5)).toBe("123412.5");
		expect(javaFloatString(1283.25)).toBe("1283.25");
		expect(javaFloatString(12345678)).toBe("1.2345678E7");
		expect(javaFloatString(0)).toBe("0.0");
	});

	it("keeps the double spaces of the native description", () => {
		expect(extraTimeDescription(34, "charlnassar", 5000)).toBe(
			"Add  [ 34 Day(s)  ]  For ExpiryAccount For User : charlnassar - [Final Credit = 5000.0 ]",
		);
	});
});
