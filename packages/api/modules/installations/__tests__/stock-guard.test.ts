import { describe, expect, it } from "vitest";
import { assertWorkerHoldsStockLines } from "../lib/stock-guard";

function fakeClient(
	holdings: Array<{ id: string; name: string; quantity: number }>,
) {
	return {
		workerStock: {
			findMany: async () =>
				holdings.map((h) => ({
					stockItemId: h.id,
					quantity: h.quantity,
					stockItem: { name: h.name },
				})),
		},
		stockItem: {
			findMany: async () =>
				holdings.map((h) => ({ id: h.id, name: h.name })),
		},
	} as unknown as Parameters<typeof assertWorkerHoldsStockLines>[0];
}

describe("assertWorkerHoldsStockLines", () => {
	it("refuses more than the worker holds and names the item", async () => {
		const client = fakeClient([
			{ id: "cable", name: "Utp Cat5E Outdoor", quantity: 24 },
		]);
		await expect(
			assertWorkerHoldsStockLines(client, "w1", [
				{ stockItemId: "cable", quantity: 28 },
			]),
		).rejects.toThrow("You hold 24 × Utp Cat5E Outdoor — cannot use 28");
	});

	it("sums lines of the same item before comparing", async () => {
		const client = fakeClient([
			{ id: "cable", name: "Cable", quantity: 24 },
		]);
		await expect(
			assertWorkerHoldsStockLines(client, "w1", [
				{ stockItemId: "cable", quantity: 20 },
				{ stockItemId: "cable", quantity: 5 },
			]),
		).rejects.toThrow("cannot use 25");
	});

	it("passes when quantities fit and ignores add-on lines", async () => {
		const client = fakeClient([
			{ id: "cable", name: "Cable", quantity: 24 },
		]);
		await expect(
			assertWorkerHoldsStockLines(client, "w1", [
				{ stockItemId: "cable", quantity: 24 },
				{ stockItemId: null, quantity: 1 },
			]),
		).resolves.toBeUndefined();
	});
});
