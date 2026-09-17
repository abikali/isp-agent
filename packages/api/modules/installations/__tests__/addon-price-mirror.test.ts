import { beforeEach, describe, expect, it, vi } from "vitest";

const iradius = vi.hoisted(() => ({
	iradiusSetIptvPrice: vi.fn(async () => ({ affectedRows: 1 })),
	iradiusSetRealIpPrice: vi.fn(async () => ({ affectedRows: 1 })),
}));

// The real module opens MySQL / HTTP clients; only the two add-on writers can
// be reached from an add-on-only diff, the rest just need to exist.
vi.mock("../../customers/lib/iradius-api", () => {
	const unexpected = vi.fn(async () => {
		throw new Error("unexpected iRadius write");
	});
	return {
		...iradius,
		iradiusChangeCollector: unexpected,
		iradiusSetDeductMoney: unexpected,
		iradiusSetRecurringDiscount: unexpected,
		iradiusUpdateUserAddress: unexpected,
		iradiusUpdateUserComment: unexpected,
		iradiusUpdateUserEmail: unexpected,
		iradiusUpdateUserGroup: unexpected,
		iradiusUpdateUserLocation: unexpected,
		iradiusUpdateUserName: unexpected,
		iradiusUpdateUserPhones: unexpected,
	};
});

const { pushAddonPricesToIRadius } = await import("../lib/addon-price-mirror");
const { addonPriceFields } = await import("../lib/addons");

const linked = { externalId: "84541", firstName: "Lorein", lastName: null };

describe("addonPriceFields", () => {
	it("maps IPTV and Real IP add-on lines to customer price fields", () => {
		expect(
			addonPriceFields([
				{ isAddOn: true, notes: "IPTV", price: 5 },
				{ isAddOn: true, notes: "Real IP", price: 10 },
				{ isAddOn: false, notes: "IPTV cable", price: 3 },
			]),
		).toEqual({ iptvPrice: 5, realIpPrice: 10 });
	});

	it("ignores physical lines and unrecognised add-on notes", () => {
		expect(
			addonPriceFields([
				{ isAddOn: false, notes: null, price: 20 },
				{ isAddOn: true, notes: "Static route", price: 4 },
			]),
		).toEqual({});
	});

	it("keeps an explicit zero price", () => {
		expect(
			addonPriceFields([{ isAddOn: true, notes: "IPTV", price: 0 }]),
		).toEqual({ iptvPrice: 0 });
	});
});

describe("pushAddonPricesToIRadius", () => {
	beforeEach(() => {
		iradius.iradiusSetIptvPrice.mockClear();
		iradius.iradiusSetRealIpPrice.mockClear();
	});

	it("pushes the approved add-on prices for a linked customer", async () => {
		await pushAddonPricesToIRadius(linked, [
			{ isAddOn: true, notes: "IPTV", price: 5 },
			{ isAddOn: true, notes: "Real IP", price: 10 },
		]);
		expect(iradius.iradiusSetIptvPrice).toHaveBeenCalledWith(
			{ externalId: "84541" },
			5,
		);
		expect(iradius.iradiusSetRealIpPrice).toHaveBeenCalledWith(
			{ externalId: "84541" },
			10,
		);
	});

	it("does nothing for unlinked customers or lines without an add-on", async () => {
		await pushAddonPricesToIRadius(null, [
			{ isAddOn: true, notes: "IPTV", price: 5 },
		]);
		await pushAddonPricesToIRadius({ ...linked, externalId: null }, [
			{ isAddOn: true, notes: "IPTV", price: 5 },
		]);
		await pushAddonPricesToIRadius(linked, [
			{ isAddOn: false, notes: null, price: 20 },
		]);
		expect(iradius.iradiusSetIptvPrice).not.toHaveBeenCalled();
		expect(iradius.iradiusSetRealIpPrice).not.toHaveBeenCalled();
	});

	it("propagates an iRadius failure so the caller skips its local write", async () => {
		iradius.iradiusSetIptvPrice.mockRejectedValueOnce(new Error("down"));
		await expect(
			pushAddonPricesToIRadius(linked, [
				{ isAddOn: true, notes: "IPTV", price: 5 },
			]),
		).rejects.toThrow("down");
	});
});
