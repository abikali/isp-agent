import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	iradiusSetApElectrical: vi.fn(async () => ({ affectedRows: 1 })),
	findFirst: vi.fn(),
	customers: vi.fn(),
	installs: vi.fn(),
	uninstalls: vi.fn(),
	customerUpdate: vi.fn(async () => ({ id: "c1" })),
}));

vi.mock("../../customers/lib/iradius-api", () => ({
	iradiusSetApElectrical: mocks.iradiusSetApElectrical,
}));

vi.mock("@repo/database", () => ({
	db: {
		stockItem: { findFirst: mocks.findFirst },
		customer: {
			findMany: mocks.customers,
			update: mocks.customerUpdate,
		},
		installation: { findMany: mocks.installs },
		uninstalledItem: { findMany: mocks.uninstalls },
	},
}));

const { pushApElectricalToIRadius, clearApElectricalAfterUninstall } =
	await import("../lib/electricity-mirror");

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

describe("clearApElectricalAfterUninstall", () => {
	const input = {
		organizationId: "org",
		uninstalledItemIds: ["u1"],
		iradiusDisabled: false,
	};
	const day = (n: number) => new Date(Date.UTC(2026, 9, n));
	const customer = { id: "c1", externalId: "84541" };

	it("does nothing when no approved item is an electricity item on a flagged customer", async () => {
		mocks.customers.mockResolvedValue([]);
		await clearApElectricalAfterUninstall(input);
		expect(mocks.iradiusSetApElectrical).not.toHaveBeenCalled();
		expect(mocks.customerUpdate).not.toHaveBeenCalled();
	});

	it("clears iRadius first, then the customer, when the item is gone", async () => {
		mocks.customers.mockResolvedValue([customer]);
		mocks.installs.mockResolvedValue([
			{ stockItemId: "adapter", installedAt: day(1), taskId: "t1" },
		]);
		mocks.uninstalls.mockResolvedValue([
			{ stockItemId: "adapter", uninstalledAt: day(5), taskId: "t2" },
		]);
		await clearApElectricalAfterUninstall(input);
		expect(mocks.iradiusSetApElectrical).toHaveBeenCalledWith(
			customer,
			false,
		);
		expect(mocks.customerUpdate).toHaveBeenCalledWith({
			where: { id: "c1" },
			data: { apElectrical: false },
			select: { id: true },
		});
	});

	it("keeps the flag while another electricity item is still installed", async () => {
		mocks.customers.mockResolvedValue([customer]);
		mocks.installs.mockResolvedValue([
			{ stockItemId: "adapter", installedAt: day(1), taskId: "t1" },
			{ stockItemId: "ups", installedAt: day(1), taskId: "t1" },
		]);
		mocks.uninstalls.mockResolvedValue([
			{ stockItemId: "adapter", uninstalledAt: day(5), taskId: "t2" },
		]);
		await clearApElectricalAfterUninstall(input);
		expect(mocks.iradiusSetApElectrical).not.toHaveBeenCalled();
		expect(mocks.customerUpdate).not.toHaveBeenCalled();
	});

	it("keeps the flag when the same task replaced the item", async () => {
		mocks.customers.mockResolvedValue([customer]);
		mocks.installs.mockResolvedValue([
			{ stockItemId: "adapter", installedAt: day(5), taskId: "t2" },
		]);
		mocks.uninstalls.mockResolvedValue([
			{ stockItemId: "adapter", uninstalledAt: day(6), taskId: "t2" },
		]);
		await clearApElectricalAfterUninstall(input);
		expect(mocks.iradiusSetApElectrical).not.toHaveBeenCalled();
	});

	it("leaves the customer untouched and does not throw when iRadius fails", async () => {
		mocks.customers.mockResolvedValue([customer]);
		mocks.installs.mockResolvedValue([]);
		mocks.uninstalls.mockResolvedValue([]);
		mocks.iradiusSetApElectrical.mockRejectedValueOnce(new Error("down"));
		await expect(
			clearApElectricalAfterUninstall(input),
		).resolves.toBeUndefined();
		expect(mocks.customerUpdate).not.toHaveBeenCalled();
	});
});
