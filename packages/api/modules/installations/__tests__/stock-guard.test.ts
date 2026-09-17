import { bilingual } from "@repo/utils";
import { describe, expect, it } from "vitest";
import {
	assertStockAvailable,
	computeShortfalls,
	decrementWorkerStock,
	shortfallMessage,
	sumLinesByItem,
} from "../lib/stock-guard";

interface FakeState {
	holdings: Array<{ id: string; name: string; quantity: number }>;
	pendingInstalls?: Array<{
		id: string;
		stockItemId: string;
		quantity: number;
	}>;
	pendingRefunds?: Array<{
		id: string;
		stockItemId: string;
		quantity: number;
	}>;
	employeeName?: string;
}

function sumByItem(
	rows: Array<{ id: string; stockItemId: string; quantity: number }>,
	where: { id?: { notIn: string[] } },
) {
	const excluded = new Set(where.id?.notIn ?? []);
	const sums = new Map<string, number>();
	for (const row of rows) {
		if (!excluded.has(row.id)) {
			sums.set(
				row.stockItemId,
				(sums.get(row.stockItemId) ?? 0) + row.quantity,
			);
		}
	}
	return [...sums].map(([stockItemId, quantity]) => ({
		stockItemId,
		_sum: { quantity },
	}));
}

function fakeClient(state: FakeState) {
	return {
		workerStock: {
			findMany: async () =>
				state.holdings.map((h) => ({
					stockItemId: h.id,
					quantity: h.quantity,
				})),
		},
		installation: {
			groupBy: async ({
				where,
			}: {
				where: { id?: { notIn: string[] } };
			}) => sumByItem(state.pendingInstalls ?? [], where),
		},
		stockRefundRequest: {
			groupBy: async ({
				where,
			}: {
				where: { id?: { notIn: string[] } };
			}) => sumByItem(state.pendingRefunds ?? [], where),
		},
		stockItem: {
			findUnique: async ({ where }: { where: { id: string } }) => {
				const h = state.holdings.find((x) => x.id === where.id);
				return h ? { name: h.name } : null;
			},
		},
		employee: {
			findUnique: async () => ({ name: state.employeeName ?? "walewe" }),
		},
	} as unknown as Parameters<typeof assertStockAvailable>[0];
}

const cable = { id: "cable", name: "Utp Cat5E Outdoor", quantity: 24 };

describe("computeShortfalls", () => {
	it("nets reservations off the holding", () => {
		const needed = sumLinesByItem([
			{ stockItemId: "cable", quantity: 10 },
			{ stockItemId: "cable", quantity: 5 },
			{ stockItemId: null, quantity: 1 },
		]);
		expect(needed.get("cable")).toBe(15);
		expect(
			computeShortfalls({
				needed,
				held: new Map([["cable", 24]]),
				pendingInstalls: new Map([["cable", 10]]),
			}),
		).toEqual([
			{
				stockItemId: "cable",
				held: 24,
				pendingInstalls: 10,
				pendingRefunds: 0,
				needed: 15,
			},
		]);
		expect(
			computeShortfalls({ needed, held: new Map([["cable", 24]]) }),
		).toEqual([]);
	});
});

describe("shortfallMessage", () => {
	const s = {
		stockItemId: "cable",
		held: 24,
		pendingInstalls: 10,
		pendingRefunds: 0,
		needed: 28,
	};
	it("tells the worker what he can still use", () => {
		expect(
			shortfallMessage(s, { itemName: cable.name, audience: "worker" }),
		).toBe(
			bilingual(
				"You hold 24 × Utp Cat5E Outdoor (10 already on pending installs), so you can use 14, not 28. Lower the quantity or ask for a delivery first.",
				"معك 24 × Utp Cat5E Outdoor (10 على تركيبات معلّقة)، يمكنك استعمال 14 فقط وليس 28. خفّف الكمية أو اطلب تسليم أولاً.",
			),
		);
	});
	it("names the worker for admins", () => {
		expect(
			shortfallMessage(
				{ ...s, pendingInstalls: 0 },
				{
					itemName: cable.name,
					audience: "admin",
					employeeName: "walewe",
				},
			),
		).toBe(
			"walewe holds 24 × Utp Cat5E Outdoor — this needs 28. Deliver stock or lower the quantity.",
		);
	});
});

describe("assertStockAvailable", () => {
	it("refuses more than the worker holds and names the item", async () => {
		const client = fakeClient({ holdings: [cable] });
		await expect(
			assertStockAvailable(client, {
				employeeId: "w1",
				lines: [{ stockItemId: "cable", quantity: 28 }],
				reserve: true,
				audience: "worker",
			}),
		).rejects.toThrow(
			"You hold 24 × Utp Cat5E Outdoor, so you cannot use 28",
		);
	});

	it("sums lines of the same item before comparing", async () => {
		const client = fakeClient({ holdings: [cable] });
		await expect(
			assertStockAvailable(client, {
				employeeId: "w1",
				lines: [
					{ stockItemId: "cable", quantity: 20 },
					{ stockItemId: "cable", quantity: 5 },
				],
				reserve: false,
				audience: "admin",
			}),
		).rejects.toThrow(
			"walewe holds 24 × Utp Cat5E Outdoor — this needs 25",
		);
	});

	it("reserves pending installs and refunds when asked", async () => {
		const client = fakeClient({
			holdings: [cable],
			pendingInstalls: [{ id: "i1", stockItemId: "cable", quantity: 10 }],
			pendingRefunds: [{ id: "r1", stockItemId: "cable", quantity: 4 }],
		});
		await expect(
			assertStockAvailable(client, {
				employeeId: "w1",
				lines: [{ stockItemId: "cable", quantity: 11 }],
				reserve: true,
				audience: "worker",
			}),
		).rejects.toThrow(
			"(10 already on pending installs, 4 on pending refunds), so you can use 10, not 11",
		);
		// Approval lens ignores reservations.
		await expect(
			assertStockAvailable(client, {
				employeeId: "w1",
				lines: [{ stockItemId: "cable", quantity: 24 }],
				reserve: false,
				audience: "admin",
			}),
		).resolves.toBeUndefined();
	});

	it("excludes the edited line and the refund under review", async () => {
		const client = fakeClient({
			holdings: [cable],
			pendingInstalls: [
				{ id: "i1", stockItemId: "cable", quantity: 10 },
				{ id: "i2", stockItemId: "cable", quantity: 4 },
			],
			pendingRefunds: [{ id: "r1", stockItemId: "cable", quantity: 6 }],
		});
		await expect(
			assertStockAvailable(client, {
				employeeId: "w1",
				lines: [{ stockItemId: "cable", quantity: 20 }],
				reserve: true,
				excludeInstallationIds: ["i1"],
				excludeRefundRequestIds: ["r1"],
				audience: "admin",
			}),
		).resolves.toBeUndefined();
		await expect(
			assertStockAvailable(client, {
				employeeId: "w1",
				lines: [{ stockItemId: "cable", quantity: 21 }],
				reserve: true,
				excludeInstallationIds: ["i1"],
				excludeRefundRequestIds: ["r1"],
				audience: "admin",
				hint: "Review their pending installs first.",
			}),
		).rejects.toThrow(
			"walewe holds 24 × Utp Cat5E Outdoor (4 already on other pending installs), so only 20 are free — this needs 21. Review their pending installs first.",
		);
	});

	it("passes when quantities fit and ignores add-on lines", async () => {
		const client = fakeClient({ holdings: [cable] });
		await expect(
			assertStockAvailable(client, {
				employeeId: "w1",
				lines: [
					{ stockItemId: "cable", quantity: 24 },
					{ stockItemId: null, quantity: 1 },
				],
				reserve: true,
				audience: "worker",
			}),
		).resolves.toBeUndefined();
	});
});

describe("decrementWorkerStock", () => {
	function txWith(quantity: number) {
		const row = { quantity };
		return {
			row,
			tx: {
				workerStock: {
					updateMany: async ({
						where,
						data,
					}: {
						where: { quantity: { gte: number } };
						data: { quantity: { decrement: number } };
					}) => {
						if (row.quantity < where.quantity.gte) {
							return { count: 0 };
						}
						row.quantity -= data.quantity.decrement;
						return { count: 1 };
					},
					findUniqueOrThrow: async () => ({ quantity: row.quantity }),
				},
			} as unknown as Parameters<typeof decrementWorkerStock>[0],
		};
	}

	it("decrements and reports before/after", async () => {
		const { tx, row } = txWith(24);
		await expect(
			decrementWorkerStock(tx, {
				stockItemId: "cable",
				employeeId: "w1",
				quantity: 20,
			}),
		).resolves.toEqual({ before: 24, after: 4 });
		expect(row.quantity).toBe(4);
	});

	it("returns null without touching stock when short", async () => {
		const { tx, row } = txWith(4);
		await expect(
			decrementWorkerStock(tx, {
				stockItemId: "cable",
				employeeId: "w1",
				quantity: 5,
			}),
		).resolves.toBeNull();
		expect(row.quantity).toBe(4);
	});
});
