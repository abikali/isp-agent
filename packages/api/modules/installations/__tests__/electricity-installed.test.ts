import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	iradiusSetApElectricalOnMany: vi.fn(async (ids: string[]) => ids),
	installations: vi.fn(),
	stockItems: vi.fn(async () => [{ name: "Adapter Poe 24v 1.5A" }]),
	uninstalls: vi.fn(async () => [] as unknown[]),
	updateMany: vi.fn(
		async ({ where }: { where: { id: { in: string[] } } }) => ({
			count: where.id.in.length,
		}),
	),
}));

vi.mock("../../customers/lib/iradius-api", () => ({
	iradiusSetApElectricalOnMany: mocks.iradiusSetApElectricalOnMany,
}));

vi.mock("@repo/database", () => ({
	db: {
		installation: { findMany: mocks.installations },
		stockItem: { findMany: mocks.stockItems },
		uninstalledItem: { findMany: mocks.uninstalls },
		customer: { updateMany: mocks.updateMany },
	},
}));

const { applyElectricityToInstalledCustomers } = await import(
	"../lib/electricity-installed"
);

const base = {
	organizationId: "org",
	stockItemIds: ["item-adapter"],
	iradiusDisabled: false,
};
const install = (id: string, externalId: string | null, day: number) => ({
	installedAt: new Date(Date.UTC(2026, 8, day)),
	customer: { id, externalId },
});

beforeEach(() => {
	vi.clearAllMocks();
});

describe("applyElectricityToInstalledCustomers", () => {
	it("does nothing when no customer has the item installed", async () => {
		mocks.installations.mockResolvedValue([]);
		expect(await applyElectricityToInstalledCustomers(base)).toBe(0);
		expect(mocks.iradiusSetApElectricalOnMany).not.toHaveBeenCalled();
		expect(mocks.updateMany).not.toHaveBeenCalled();
	});

	it("sets iRadius first, then each customer once locally", async () => {
		mocks.installations.mockResolvedValue([
			install("c1", "101", 1),
			install("c1", "101", 5),
			install("c2", "102", 2),
		]);
		expect(await applyElectricityToInstalledCustomers(base)).toBe(2);
		expect(mocks.iradiusSetApElectricalOnMany).toHaveBeenCalledWith([
			"101",
			"102",
		]);
		expect(mocks.updateMany).toHaveBeenCalledWith({
			where: { id: { in: ["c1", "c2"] }, apElectrical: false },
			data: { apElectrical: true },
		});
	});

	it("skips a customer whose item was uninstalled after the last install", async () => {
		mocks.installations.mockResolvedValue([
			install("c1", "101", 1),
			install("c2", "102", 10),
		]);
		mocks.uninstalls.mockResolvedValue([
			{
				uninstalledAt: new Date(Date.UTC(2026, 8, 5)),
				task: { customerId: "c1" },
			},
			{
				uninstalledAt: new Date(Date.UTC(2026, 8, 5)),
				task: { customerId: "c2" },
			},
		]);
		expect(await applyElectricityToInstalledCustomers(base)).toBe(1);
		expect(mocks.iradiusSetApElectricalOnMany).toHaveBeenCalledWith([
			"102",
		]);
	});

	it("leaves a customer local-untouched when iRadius has no row for them", async () => {
		mocks.installations.mockResolvedValue([
			install("c1", "101", 1),
			install("c2", "102", 1),
		]);
		mocks.uninstalls.mockResolvedValue([]);
		mocks.iradiusSetApElectricalOnMany.mockResolvedValueOnce(["102"]);
		expect(await applyElectricityToInstalledCustomers(base)).toBe(1);
		expect(mocks.updateMany).toHaveBeenCalledWith({
			where: { id: { in: ["c2"] }, apElectrical: false },
			data: { apElectrical: true },
		});
	});

	it("writes locally only for unlinked customers and iRadius-disabled orgs", async () => {
		mocks.installations.mockResolvedValue([
			install("c1", null, 1),
			install("c2", "102", 1),
		]);
		mocks.uninstalls.mockResolvedValue([]);
		expect(
			await applyElectricityToInstalledCustomers({
				...base,
				iradiusDisabled: true,
			}),
		).toBe(2);
		expect(mocks.iradiusSetApElectricalOnMany).not.toHaveBeenCalled();
	});

	it("changes nothing locally when the iRadius write fails", async () => {
		mocks.installations.mockResolvedValue([install("c1", "101", 1)]);
		mocks.uninstalls.mockResolvedValue([]);
		mocks.iradiusSetApElectricalOnMany.mockRejectedValueOnce(
			new Error("tunnel down"),
		);
		await expect(
			applyElectricityToInstalledCustomers(base),
		).rejects.toThrow(/nothing was changed/);
		expect(mocks.updateMany).not.toHaveBeenCalled();
	});
});
