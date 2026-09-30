import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/database/iradius", () => ({
	executeIRadius: vi.fn(),
	queryIRadius: vi.fn(),
	withIRadiusConnection: vi.fn((fn: (conn: unknown) => unknown) => fn({})),
}));

vi.mock("../lib/iradius-disconnect", () => ({
	iradiusForceDisconnect: vi.fn(),
}));

import { executeIRadius, queryIRadius } from "@repo/database/iradius";
import {
	IRadiusExpiryChangedError,
	iradiusChargeNewUser,
	iradiusDeleteUser,
	iradiusGetExpiry,
	iradiusRenewUser,
	iradiusResetMacAddress,
	iradiusSetApElectrical,
	sanitizeBridgeText,
} from "../lib/iradius-api";

const mockExecute = vi.mocked(executeIRadius);
const mockQuery = vi.mocked(queryIRadius);
const fetchMock = vi.fn();

function respond(status: number, body: unknown) {
	fetchMock.mockResolvedValueOnce(
		new Response(typeof body === "string" ? body : JSON.stringify(body), {
			status,
		}),
	);
}

function sentForm(): URLSearchParams {
	const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
	return new URLSearchParams(String(init.body));
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubGlobal("fetch", fetchMock);
	vi.stubEnv("IRADIUS_BRIDGE_URL", "http://iradius.test/iradius/libancom");
	vi.stubEnv("IRADIUS_CHARGE_URL", "");
	vi.stubEnv("IRADIUS_CHARGE_SECRET", "s3cret");
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

describe("callIRadiusBridge via the op wrappers", () => {
	it("posts op + params as a form with the secret header", async () => {
		respond(200, { success: true });
		await iradiusChargeNewUser(84567);

		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("http://iradius.test/iradius/libancom");
		expect(init.method).toBe("POST");
		expect(
			(init.headers as Record<string, string>)["X-Charge-Secret"],
		).toBe("s3cret");
		expect(Object.fromEntries(sentForm())).toEqual({
			op: "charge-new-user",
			userId: "84567",
		});
	});

	it("falls back to IRADIUS_CHARGE_URL when the bridge URL is unset", async () => {
		vi.stubEnv("IRADIUS_BRIDGE_URL", "");
		vi.stubEnv("IRADIUS_CHARGE_URL", "http://old/charge-new-user");
		respond(200, { success: true, skipped: true });
		await iradiusChargeNewUser(1);
		expect(fetchMock.mock.calls[0]?.[0]).toBe("http://old/charge-new-user");
	});

	it("throws when not configured", async () => {
		vi.stubEnv("IRADIUS_BRIDGE_URL", "");
		await expect(iradiusChargeNewUser(1)).rejects.toThrow(/not configured/);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("throws a bridge-missing error on 404", async () => {
		respond(404, "<html>Not Found</html>");
		await expect(iradiusChargeNewUser(1)).rejects.toThrow(/HTTP 404/);
	});

	it("surfaces the servlet's error on success:false", async () => {
		respond(200, { success: false, error: "Dealer credit insufficient" });
		await expect(
			iradiusRenewUser({ externalId: "5" }, "2026-09-01 23:59:56"),
		).rejects.toThrow("Dealer credit insufficient");
	});
});

describe("iradiusRenewUser", () => {
	it("sends the expected expiry and returns the new one", async () => {
		respond(200, { success: true, newExpiry: "2026-10-30 23:59:56" });
		await expect(
			iradiusRenewUser({ externalId: "5" }, "2026-09-01 23:59:56"),
		).resolves.toEqual({ newExpiry: "2026-10-30 23:59:56" });
		expect(Object.fromEntries(sentForm())).toEqual({
			op: "renew",
			userId: "5",
			expectedExpiry: "2026-09-01 23:59:56",
		});
	});

	it("sends a null expected expiry as the literal 'null'", async () => {
		respond(200, { success: true, newExpiry: "2026-10-30 23:59:56" });
		await iradiusRenewUser({ externalId: "5" }, null);
		expect(sentForm().get("expectedExpiry")).toBe("null");
	});

	it("maps HTTP 409 to IRadiusExpiryChangedError", async () => {
		respond(409, { success: false, error: "expiry changed" });
		await expect(
			iradiusRenewUser({ externalId: "5" }, "2026-09-01 23:59:56"),
		).rejects.toBeInstanceOf(IRadiusExpiryChangedError);
	});

	it("refuses an unlinked customer without calling the bridge", async () => {
		await expect(
			iradiusRenewUser({ externalId: null }, null),
		).rejects.toThrow(/not linked/);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe("iradiusDeleteUser", () => {
	it("sends the sanitised operator name and reports alreadyDeleted", async () => {
		respond(200, { success: true, alreadyDeleted: true });
		await expect(
			iradiusDeleteUser({ externalId: "9" }, 'Jhonny "DROP TABLE'),
		).resolves.toEqual({ alreadyDeleted: true });
		expect(Object.fromEntries(sentForm())).toEqual({
			op: "delete-user",
			userId: "9",
			by: "Jhonny TABLE",
		});
	});

	it("strips the tokens iRadius' injection check rejects", () => {
		expect(sanitizeBridgeText("a CREATE b information_schema c")).toBe(
			"a b  c",
		);
	});
});

describe("iradiusGetExpiry", () => {
	it("returns the literal ExpiryAccount", async () => {
		mockQuery.mockResolvedValueOnce([
			{ ExpiryAccount: "2026-09-01 23:59:56" },
		]);
		await expect(iradiusGetExpiry("5")).resolves.toBe(
			"2026-09-01 23:59:56",
		);
	});

	it("throws when the user has no UserNas row", async () => {
		mockQuery.mockResolvedValueOnce([]);
		await expect(iradiusGetExpiry("5")).rejects.toThrow(/not found/);
	});
});

describe("iradiusResetMacAddress", () => {
	it("clears the MAC then writes the op-5 UserLog row", async () => {
		mockExecute
			.mockResolvedValueOnce({ affectedRows: 1 })
			.mockResolvedValueOnce({ affectedRows: 1 });
		await iradiusResetMacAddress({ externalId: "7" });

		expect(mockExecute).toHaveBeenCalledTimes(2);
		expect(mockExecute.mock.calls[0]?.[1]).toMatch(
			/UPDATE UserNas SET MacAddress = NULL WHERE UserId = \?/,
		);
		const logSql = String(mockExecute.mock.calls[1]?.[1]);
		expect(logSql).toMatch(/INSERT INTO UserLog/);
		expect(logSql).toMatch(/5, 'Reset Mac Address'/);
		expect(mockExecute.mock.calls[1]?.[2]).toEqual([7]);
	});

	it("does not throw when the log insert fails", async () => {
		mockExecute
			.mockResolvedValueOnce({ affectedRows: 1 })
			.mockRejectedValueOnce(new Error("boom"));
		await expect(
			iradiusResetMacAddress({ externalId: "7" }),
		).resolves.toEqual({ affectedRows: 1 });
	});

	it("skips the log when no row was updated", async () => {
		mockExecute.mockResolvedValueOnce({ affectedRows: 0 });
		await iradiusResetMacAddress({ externalId: "7" });
		expect(mockExecute).toHaveBeenCalledTimes(1);
	});
});

describe("iradiusSetApElectrical", () => {
	it("binds the BIT column as 1/0", async () => {
		mockExecute.mockResolvedValue({ affectedRows: 1 });
		await iradiusSetApElectrical({ externalId: "3" }, true);
		await iradiusSetApElectrical({ externalId: "3" }, false);
		expect(mockExecute.mock.calls[0]?.[1]).toBe(
			"UPDATE UserNas SET APElectrical = ? WHERE UserId = ?",
		);
		expect(mockExecute.mock.calls[0]?.[2]).toEqual([1, 3]);
		expect(mockExecute.mock.calls[1]?.[2]).toEqual([0, 3]);
	});
});
