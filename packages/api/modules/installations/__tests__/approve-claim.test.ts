import { describe, expect, it, vi } from "vitest";

// review.ts pulls in the Prisma client, notifications and iRadius clients;
// approveInstallationInTx only talks to the transaction it is handed.
vi.mock("@repo/database", () => ({ db: {} }));
vi.mock("@repo/api/lib/notify-employee", () => ({
	notifyFieldEmployee: vi.fn(),
}));
vi.mock("../../customers/lib/iradius-mirror", () => ({
	mirrorToIRadius: vi.fn(),
}));
vi.mock("../lib/addon-price-mirror", () => ({
	pushAddonPricesToIRadius: vi.fn(),
}));
vi.mock("../lib/electricity-mirror", () => ({
	pushApElectricalToIRadius: vi.fn(),
}));

const { approveInstallationInTx } = await import("../procedures/review");

type Tx = Parameters<typeof approveInstallationInTx>[0];

const line = {
	id: "inst-1",
	organizationId: "org-1",
	employeeId: "emp-1",
	customerId: null,
	stockItemId: "item-1",
	isAddOn: false,
	quantity: 2,
	price: 10,
	notes: null,
};

/** In-memory tx: one installation row and one worker holding. */
function fakeTx(
	state: { status: string; held: number },
	item: { name: string; isElectricity: boolean } = {
		name: "Utp Cat5E",
		isElectricity: false,
	},
) {
	const cash: unknown[] = [];
	const tx = {
		installation: {
			updateMany: vi.fn(
				async ({ where }: { where: { status: string } }) => {
					if (state.status !== where.status) {
						return { count: 0 };
					}
					state.status = "APPROVED";
					return { count: 1 };
				},
			),
		},
		workerStock: {
			updateMany: vi.fn(
				async ({
					where,
					data,
				}: {
					where: { quantity: { gte: number } };
					data: { quantity: { decrement: number } };
				}) => {
					if (state.held < where.quantity.gte) {
						return { count: 0 };
					}
					state.held -= data.quantity.decrement;
					return { count: 1 };
				},
			),
			findUniqueOrThrow: vi.fn(async () => ({ quantity: state.held })),
		},
		stockItem: {
			findUniqueOrThrow: vi.fn(async () => item),
		},
		customer: { update: vi.fn(async () => ({})) },
		stockLog: { create: vi.fn(async () => ({})) },
		cashCollection: {
			create: vi.fn(async (args: unknown) => {
				cash.push(args);
				return {};
			}),
		},
	};
	return { tx: tx as unknown as Tx, raw: tx, cash };
}

describe("approveInstallationInTx", () => {
	it("claims a pending line, takes stock and logs cash once", async () => {
		const state = { status: "PENDING", held: 24 };
		const { tx, cash } = fakeTx(state);
		await approveInstallationInTx(tx, line, "admin-1", {
			createCashEntry: true,
		});
		expect(state.status).toBe("APPROVED");
		expect(state.held).toBe(22);
		expect(cash).toHaveLength(1);
	});

	it("refuses a line that is no longer pending before touching stock or cash", async () => {
		// Second of two concurrent approvals: the first already claimed it.
		const state = { status: "APPROVED", held: 24 };
		const { tx, raw, cash } = fakeTx(state);
		await expect(
			approveInstallationInTx(tx, line, "admin-2", {
				createCashEntry: true,
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect(raw.workerStock.updateMany).not.toHaveBeenCalled();
		expect(state.held).toBe(24);
		expect(cash).toHaveLength(0);
	});

	it("sets the customer's AP Electrical flag for an electricity item", async () => {
		const state = { status: "PENDING", held: 5 };
		const { tx, raw } = fakeTx(state, {
			name: "Adapter Poe 24v 1.5A",
			isElectricity: true,
		});
		await approveInstallationInTx(
			tx,
			{ ...line, customerId: "cust-1", quantity: 1 },
			"admin-1",
			{ createCashEntry: false },
		);
		expect(raw.customer.update).toHaveBeenCalledWith({
			where: { id: "cust-1" },
			data: { apElectrical: true },
		});
	});

	it("leaves AP Electrical alone for other items", async () => {
		const state = { status: "PENDING", held: 5 };
		const { tx, raw } = fakeTx(state);
		await approveInstallationInTx(
			tx,
			{ ...line, customerId: "cust-1", quantity: 1 },
			"admin-1",
			{ createCashEntry: false },
		);
		expect(raw.customer.update).not.toHaveBeenCalled();
	});
});
