import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	iradiusSetApElectrical: vi.fn(async () => ({ affectedRows: 1 })),
	findFirst: vi.fn(),
}));

vi.mock("../../customers/lib/iradius-api", () => ({
	iradiusSetApElectrical: mocks.iradiusSetApElectrical,
}));

vi.mock("@repo/database", () => ({
	db: { stockItem: { findFirst: mocks.findFirst } },
}));

const { pushApElectricalToIRadius } = await import("../lib/electricity-mirror");

const linked = { externalId: "84541" };
const adapter = { stockItemId: "item-adapter", isAddOn: false };
const cable = { stockItemId: "item-cable", isAddOn: false };

beforeEach(() => {
	vi.clearAllMocks();
});

describe("pushApElectricalToIRadius", () => {
	it("makes no call for an unlinked customer", async () => {
		await pushApElectricalToIRadius({ externalId: null }, [adapter]);
		await pushApElectricalToIRadius(null, [adapter]);
		expect(mocks.findFirst).not.toHaveBeenCalled();
		expect(mocks.iradiusSetApElectrical).not.toHaveBeenCalled();
	});

	it("makes no call when no line is an electricity item", async () => {
		mocks.findFirst.mockResolvedValue(null);
		await pushApElectricalToIRadius(linked, [cable]);
		expect(mocks.iradiusSetApElectrical).not.toHaveBeenCalled();
	});

	it("skips add-on lines and lines without a stock item", async () => {
		await pushApElectricalToIRadius(linked, [
			{ stockItemId: "x", isAddOn: true },
			{ stockItemId: null, isAddOn: false },
		]);
		expect(mocks.findFirst).not.toHaveBeenCalled();
	});

	it("sets AP Electrical once when any line is an electricity item", async () => {
		mocks.findFirst.mockResolvedValue({ id: "item-adapter" });
		await pushApElectricalToIRadius(linked, [cable, adapter]);
		expect(mocks.findFirst).toHaveBeenCalledWith({
			where: {
				id: { in: ["item-cable", "item-adapter"] },
				isElectricity: true,
			},
			select: { id: true },
		});
		expect(mocks.iradiusSetApElectrical).toHaveBeenCalledTimes(1);
		expect(mocks.iradiusSetApElectrical).toHaveBeenCalledWith(linked, true);
	});

	it("throws when the update did not land on exactly one row", async () => {
		mocks.findFirst.mockResolvedValue({ id: "item-adapter" });
		mocks.iradiusSetApElectrical.mockResolvedValueOnce({ affectedRows: 0 });
		await expect(
			pushApElectricalToIRadius(linked, [adapter]),
		).rejects.toThrow(/0 rows/);
	});
});
