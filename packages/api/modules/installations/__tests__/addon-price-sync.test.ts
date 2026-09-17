import { describe, expect, it } from "vitest";
import {
	syncCustomerAddonPrice,
	syncPendingAddonLinePrices,
} from "../lib/addon-price-sync";

type Tx = Parameters<typeof syncPendingAddonLinePrices>[0];

function fakeTx(opts: {
	lines?: Array<{ id: string; notes: string | null }>;
	requestPending?: boolean;
}) {
	const lineUpdates: Array<{ id: string; price: number }> = [];
	const customerUpdates: Array<Record<string, number>> = [];
	const tx = {
		installation: {
			findMany: async () => opts.lines ?? [],
			update: async (args: {
				where: { id: string };
				data: { price: number };
			}) => {
				lineUpdates.push({ id: args.where.id, price: args.data.price });
			},
		},
		customerSetupRequest: {
			findFirst: async () =>
				opts.requestPending ? { customerId: "c1" } : null,
		},
		customer: {
			update: async (args: { data: Record<string, number> }) => {
				customerUpdates.push(args.data);
			},
		},
	} as unknown as Tx;
	return { tx, lineUpdates, customerUpdates };
}

describe("syncPendingAddonLinePrices", () => {
	it("updates only the add-on lines whose price was edited", async () => {
		const { tx, lineUpdates } = fakeTx({
			lines: [
				{ id: "iptv", notes: "IPTV" },
				{ id: "realip", notes: "Real IP" },
			],
		});
		await syncPendingAddonLinePrices(tx, "r1", {
			IPTV: 0,
			REAL_IP: undefined,
		});
		expect(lineUpdates).toEqual([{ id: "iptv", price: 0 }]);
	});

	it("does nothing when no add-on price was edited", async () => {
		const { tx, lineUpdates } = fakeTx({
			lines: [{ id: "iptv", notes: "IPTV" }],
		});
		await syncPendingAddonLinePrices(tx, "r1", {});
		expect(lineUpdates).toEqual([]);
	});
});

describe("syncCustomerAddonPrice", () => {
	it("writes the matching customer price for a pending request", async () => {
		const { tx, customerUpdates } = fakeTx({ requestPending: true });
		await syncCustomerAddonPrice(
			tx,
			{ setupRequestId: "r1", notes: "Real IP" },
			7,
		);
		expect(customerUpdates).toEqual([{ realIpPrice: 7 }]);
	});

	it("leaves the customer alone once the request is reviewed", async () => {
		const { tx, customerUpdates } = fakeTx({ requestPending: false });
		await syncCustomerAddonPrice(
			tx,
			{ setupRequestId: "r1", notes: "IPTV" },
			7,
		);
		expect(customerUpdates).toEqual([]);
	});

	it("ignores standalone add-on lines", async () => {
		const { tx, customerUpdates } = fakeTx({ requestPending: true });
		await syncCustomerAddonPrice(
			tx,
			{ setupRequestId: null, notes: "IPTV" },
			7,
		);
		expect(customerUpdates).toEqual([]);
	});
});
