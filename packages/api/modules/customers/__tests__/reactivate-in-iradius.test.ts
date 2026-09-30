import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];

const api = vi.hoisted(() => ({
	iradiusSetActive: vi.fn(),
	iradiusGetExpiry: vi.fn(),
	iradiusRenewUser: vi.fn(),
	iradiusSetExpiryAccount: vi.fn(),
	iradiusLogExpiryAccount: vi.fn(),
}));

vi.mock("../lib/iradius-api", async () => {
	class IRadiusExpiryChangedError extends Error {}
	return { ...api, IRadiusExpiryChangedError };
});

const { reactivateInIRadius } = await import("../lib/reactivate-in-iradius");
const { IRadiusExpiryChangedError } = await import("../lib/iradius-api");

const customer = { externalId: "84567" };

beforeEach(() => {
	vi.clearAllMocks();
	calls.length = 0;
	api.iradiusSetActive.mockImplementation(async (_c, active: boolean) => {
		calls.push(active ? "activate" : "deactivate");
	});
	api.iradiusGetExpiry.mockImplementation(async () => {
		calls.push("get-expiry");
		return "2026-08-01 23:59:56";
	});
	api.iradiusRenewUser.mockImplementation(async () => {
		calls.push("renew");
		return { newExpiry: "2026-10-30 23:59:56" };
	});
	api.iradiusSetExpiryAccount.mockImplementation(async () => {
		calls.push("set-expiry");
		return { affectedRows: 1 };
	});
	api.iradiusLogExpiryAccount.mockImplementation(async () => {
		calls.push("log-expiry");
	});
});

describe("reactivateInIRadius", () => {
	it("runs activate → renew → set-expiry in order and returns the custom date", async () => {
		const result = await reactivateInIRadius({
			customer,
			activate: true,
			renew: true,
			customExpiryDate: "2026-11-15",
			reason: "test",
		});
		expect(calls).toEqual([
			"activate",
			"get-expiry",
			"renew",
			"set-expiry",
			"log-expiry",
		]);
		expect(api.iradiusRenewUser).toHaveBeenCalledWith(
			customer,
			"2026-08-01 23:59:56",
		);
		expect(result.expiresAt?.toISOString()).toBe(
			"2026-11-15T23:59:00.000Z",
		);
	});

	it("writes a custom expiry to iRadius at 23:59:00", async () => {
		await reactivateInIRadius({
			customer,
			activate: true,
			renew: false,
			customExpiryDate: "2026-10-05",
			reason: "Reactivated",
		});
		expect(api.iradiusSetExpiryAccount).toHaveBeenCalledWith(
			customer,
			"2026-10-05 23:59:00",
		);
		expect(api.iradiusLogExpiryAccount).toHaveBeenCalledWith(
			84567,
			"2026-10-05 23:59:00",
			"Reactivated",
		);
		expect(api.iradiusRenewUser).not.toHaveBeenCalled();
	});

	it("returns the renewed expiry when no custom date is given", async () => {
		const result = await reactivateInIRadius({
			customer,
			activate: false,
			renew: true,
			customExpiryDate: null,
			reason: "test",
		});
		expect(calls).toEqual(["get-expiry", "renew"]);
		expect(result.expiresAt).toEqual(new Date("2026-10-30T23:59:56"));
	});

	it("undoes the activation when the renew fails and surfaces the error", async () => {
		api.iradiusRenewUser.mockRejectedValueOnce(
			new Error("Dealer credit insufficient"),
		);
		await expect(
			reactivateInIRadius({
				customer,
				activate: true,
				renew: true,
				customExpiryDate: null,
				reason: "test",
			}),
		).rejects.toThrow(/Dealer credit insufficient/);
		expect(calls).toEqual(["activate", "get-expiry", "deactivate"]);
		expect(api.iradiusSetExpiryAccount).not.toHaveBeenCalled();
	});

	it("does not deactivate a customer it did not activate", async () => {
		api.iradiusRenewUser.mockRejectedValueOnce(new Error("boom"));
		await expect(
			reactivateInIRadius({
				customer,
				activate: false,
				renew: true,
				customExpiryDate: null,
				reason: "test",
			}),
		).rejects.toThrow();
		expect(api.iradiusSetActive).not.toHaveBeenCalled();
	});

	it("maps the 409 expiry guard to a CONFLICT", async () => {
		api.iradiusRenewUser.mockRejectedValueOnce(
			new IRadiusExpiryChangedError("expiry changed"),
		);
		await expect(
			reactivateInIRadius({
				customer,
				activate: true,
				renew: true,
				customExpiryDate: null,
				reason: "test",
			}),
		).rejects.toMatchObject({
			code: "CONFLICT",
			message: expect.stringMatching(/expiry changed/),
		});
	});

	it("keeps the renewed expiry if the custom date cannot be written after a renew", async () => {
		api.iradiusSetExpiryAccount.mockRejectedValueOnce(new Error("tunnel"));
		const result = await reactivateInIRadius({
			customer,
			activate: true,
			renew: true,
			customExpiryDate: "2026-11-15",
			reason: "test",
		});
		expect(result.expiresAt).toEqual(new Date("2026-10-30T23:59:56"));
		expect(calls).not.toContain("deactivate");
	});

	it("makes no remote call for an unlinked customer", async () => {
		const result = await reactivateInIRadius({
			customer: { externalId: null },
			activate: true,
			renew: false,
			customExpiryDate: "2026-10-05",
			reason: "test",
		});
		expect(calls).toEqual([]);
		expect(result.expiresAt?.toISOString()).toBe(
			"2026-10-05T23:59:00.000Z",
		);
	});
});
