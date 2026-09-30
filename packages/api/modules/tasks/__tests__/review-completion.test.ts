import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * reviewTaskCompletion against an in-memory store: the real line helpers
 * (approveInstallationInTx, approveUninstalledItemInTx and their reverts)
 * run on a fake transaction that snapshots the store and restores it when
 * the callback throws — so rollbacks are observable.
 */

interface InstallationRow {
	id: string;
	taskId: string;
	organizationId: string;
	status: string;
	isAddOn: boolean;
	notes: string | null;
	price: number;
	quantity: number;
	stockItemId: string | null;
	employeeId: string;
	customerId: string | null;
	setupRequestId: string | null;
	setupRequest: { status: string } | null;
}

interface RecoveredRow {
	id: string;
	taskId: string;
	organizationId: string;
	status: string;
	stockItemId: string | null;
	employeeId: string | null;
	quantity: number;
	itemName: string;
}

interface Store {
	taskStatus: string;
	installations: InstallationRow[];
	recovered: RecoveredRow[];
	workerStock: Record<string, { quantity: number; unitPrice: number }>;
	stockItems: Record<
		string,
		{ id: string; name: string; sellPrice: number; quantity: number }
	>;
	cash: Array<{ installationId: string; amount: number }>;
	events: string[];
}

let store: Store;

const key = (w: { stockItemId: string; employeeId: string }) =>
	`${w.stockItemId}|${w.employeeId}`;

function matches(row: Record<string, unknown>, where: Record<string, unknown>) {
	return Object.entries(where).every(([k, v]) => row[k] === v);
}

const tx = {
	installation: {
		updateMany: async ({
			where,
			data,
		}: {
			where: Record<string, unknown>;
			data: Partial<InstallationRow>;
		}) => {
			const rows = store.installations.filter((r) =>
				matches(r as unknown as Record<string, unknown>, where),
			);
			for (const r of rows) {
				Object.assign(r, { status: data.status ?? r.status });
			}
			return { count: rows.length };
		},
		findUnique: async ({ where }: { where: { id: string } }) =>
			store.installations.find((r) => r.id === where.id) ?? null,
		update: async ({
			where,
			data,
		}: {
			where: { id: string };
			data: { status: string };
		}) => {
			const row = store.installations.find((r) => r.id === where.id);
			if (row) {
				row.status = data.status;
			}
			return row;
		},
	},
	uninstalledItem: {
		updateMany: async ({
			where,
			data,
		}: {
			where: Record<string, unknown>;
			data: { status: string };
		}) => {
			const rows = store.recovered.filter((r) =>
				matches(r as unknown as Record<string, unknown>, where),
			);
			for (const r of rows) {
				r.status = data.status;
			}
			return { count: rows.length };
		},
		findUnique: async ({ where }: { where: { id: string } }) =>
			store.recovered.find((r) => r.id === where.id) ?? null,
		update: async ({
			where,
			data,
		}: {
			where: { id: string };
			data: Partial<RecoveredRow>;
		}) => {
			const row = store.recovered.find((r) => r.id === where.id);
			if (row && data.status) {
				row.status = data.status;
			}
			return row;
		},
	},
	workerStock: {
		updateMany: async ({
			where,
			data,
		}: {
			where: {
				stockItemId: string;
				employeeId: string;
				quantity: { gte: number };
			};
			data: { quantity: { decrement: number } };
		}) => {
			const row = store.workerStock[key(where)];
			if (!row || row.quantity < where.quantity.gte) {
				return { count: 0 };
			}
			row.quantity -= data.quantity.decrement;
			return { count: 1 };
		},
		findUnique: async ({
			where,
		}: {
			where: {
				stockItemId_employeeId: {
					stockItemId: string;
					employeeId: string;
				};
			};
		}) => store.workerStock[key(where.stockItemId_employeeId)] ?? null,
		findUniqueOrThrow: async ({
			where,
		}: {
			where: {
				stockItemId_employeeId: {
					stockItemId: string;
					employeeId: string;
				};
			};
		}) => {
			const row = store.workerStock[key(where.stockItemId_employeeId)];
			if (!row) {
				throw new Error("not found");
			}
			return row;
		},
		findMany: async ({
			where,
		}: {
			where: { employeeId: string; stockItemId: { in: string[] } };
		}) =>
			where.stockItemId.in.map((stockItemId) => ({
				stockItemId,
				quantity:
					store.workerStock[
						key({ stockItemId, employeeId: where.employeeId })
					]?.quantity ?? 0,
			})),
		upsert: async ({
			where,
			create,
			update,
		}: {
			where: {
				stockItemId_employeeId: {
					stockItemId: string;
					employeeId: string;
				};
			};
			create: { quantity: number; unitPrice?: number };
			update: { quantity: { increment: number }; unitPrice?: number };
		}) => {
			const k = key(where.stockItemId_employeeId);
			const row = store.workerStock[k];
			if (row) {
				row.quantity += update.quantity.increment;
			} else {
				store.workerStock[k] = {
					quantity: create.quantity,
					unitPrice: create.unitPrice ?? 0,
				};
			}
			return store.workerStock[k];
		},
	},
	stockItem: {
		findFirst: async ({ where }: { where: { id?: string } }) =>
			where.id ? (store.stockItems[where.id] ?? null) : null,
		findUnique: async ({ where }: { where: { id: string } }) =>
			store.stockItems[where.id] ?? null,
		findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
			const item = store.stockItems[where.id];
			if (!item) {
				throw new Error("not found");
			}
			return item;
		},
	},
	employee: { findUnique: async () => ({ name: "Walid" }) },
	stockLog: { create: async () => ({}) },
	customer: {
		update: async () => ({}),
		findUnique: async () => ({
			firstName: "Samir",
			lastName: null,
			username: "samirhalabe",
		}),
	},
	cashCollection: {
		create: async ({
			data,
		}: {
			data: { installationId: string; amount: number };
		}) => {
			store.cash.push({
				installationId: data.installationId,
				amount: data.amount,
			});
			return {};
		},
		deleteMany: async ({
			where,
		}: {
			where: { installationId: string };
		}) => {
			const before = store.cash.length;
			store.cash = store.cash.filter(
				(c) => c.installationId !== where.installationId,
			);
			return { count: before - store.cash.length };
		},
	},
	task: {
		update: async ({ data }: { data: { status: string } }) => {
			store.taskStatus = data.status;
			return { id: "task-1", status: data.status, completedAt: null };
		},
	},
};

vi.mock("@repo/database", () => ({
	db: {
		task: {
			findFirst: vi.fn(async () =>
				store.taskStatus === "PENDING_APPROVAL"
					? {
							id: "task-1",
							title: "Installation — Samir · AB12",
							completedAt: new Date(),
							completedByEmployeeId: "emp-1",
							customer: {
								externalId: "84001",
								firstName: "Samir",
								lastName: null,
							},
							installations: structuredClone(store.installations),
							uninstalledItems: structuredClone(store.recovered),
						}
					: null,
			),
		},
		$transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
			store.events.push("transaction");
			const snapshot = structuredClone(store);
			try {
				return await fn(tx);
			} catch (error) {
				store = { ...snapshot, events: store.events };
				throw error;
			}
		}),
	},
}));
vi.mock("@repo/api/lib/permission", () => ({
	requirePermission: vi.fn(async () => ({
		permCtx: {},
		activeDealerId: "dealer-1",
		iradiusDisabled: false,
	})),
	hasPermission: vi.fn(() => true),
	getDealerScopeFilter: vi.fn(() => ({})),
}));
vi.mock("@repo/api/lib/notify-employee", () => ({
	notifyFieldEmployee: vi.fn(async () => {}),
}));
vi.mock("@repo/auth/lib/audit", () => ({
	getAuditContextFromHeaders: vi.fn(() => ({})),
	taskAudit: { updated: vi.fn() },
}));
vi.mock("@repo/jobs", () => ({
	cancelTaskReminder: vi.fn(async () => {}),
	scheduleTaskReminder: vi.fn(async () => {}),
}));
vi.mock("../lib/stats-cache", () => ({ bustTaskStats: vi.fn() }));
const pushAddonPricesToIRadius = vi.fn(async () => {
	store.events.push("iradius");
});
vi.mock("../../installations/lib/addon-price-mirror", () => ({
	pushAddonPricesToIRadius,
}));

const { reviewTaskCompletion } = await import(
	"../procedures/review-completion"
);

function call(input: Record<string, unknown>) {
	return (
		reviewTaskCompletion as unknown as {
			"~orpc": { handler: (args: unknown) => Promise<unknown> };
		}
	)["~orpc"].handler({
		context: { user: { id: "admin-1" }, headers: new Headers() },
		input: { organizationId: "org-1", taskId: "task-1", ...input },
	}) as Promise<{
		approved: { installations: number; recovered: number };
		skipped: Array<{ id: string }>;
		addonPriceKept: unknown[];
	}>;
}

function installation(
	overrides: Partial<InstallationRow> = {},
): InstallationRow {
	return {
		id: "inst-1",
		taskId: "task-1",
		organizationId: "org-1",
		status: "PENDING",
		isAddOn: false,
		notes: null,
		price: 10,
		quantity: 2,
		stockItemId: "item-cable",
		employeeId: "emp-1",
		customerId: "cust-1",
		setupRequestId: null,
		setupRequest: null,
		...overrides,
	};
}

function recovered(overrides: Partial<RecoveredRow> = {}): RecoveredRow {
	return {
		id: "rec-1",
		taskId: "task-1",
		organizationId: "org-1",
		status: "PENDING",
		stockItemId: "item-router",
		employeeId: "emp-1",
		quantity: 1,
		itemName: "Router",
		...overrides,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	store = {
		taskStatus: "PENDING_APPROVAL",
		installations: [],
		recovered: [],
		workerStock: {
			"item-cable|emp-1": { quantity: 24, unitPrice: 1 },
		},
		stockItems: {
			"item-cable": {
				id: "item-cable",
				name: "Utp Cat5E",
				sellPrice: 1,
				quantity: 100,
			},
			"item-router": {
				id: "item-router",
				name: "Router",
				sellPrice: 25,
				quantity: 5,
			},
		},
		cash: [],
		events: [],
	};
});

describe("reviewTaskCompletion — approve", () => {
	it("consumes stock, logs cash per priced line, credits recovered items and completes the task", async () => {
		store.installations = [installation()];
		store.recovered = [recovered()];

		const result = await call({ action: "approve" });

		expect(result.approved).toEqual({ installations: 1, recovered: 1 });
		expect(store.installations[0]?.status).toBe("APPROVED");
		expect(store.workerStock["item-cable|emp-1"]?.quantity).toBe(22);
		expect(store.cash).toEqual([
			{ installationId: "inst-1", amount: expect.any(Number) },
		]);
		expect(store.recovered[0]?.status).toBe("APPROVED");
		expect(store.workerStock["item-router|emp-1"]?.quantity).toBe(1);
		expect(store.taskStatus).toBe("COMPLETED");
	});

	it("rolls everything back on a stock shortfall", async () => {
		store.workerStock["item-cable|emp-1"] = { quantity: 1, unitPrice: 1 };
		store.installations = [installation()];
		store.recovered = [recovered()];

		await expect(call({ action: "approve" })).rejects.toMatchObject({
			code: "CONFLICT",
		});
		expect(store.taskStatus).toBe("PENDING_APPROVAL");
		expect(store.installations[0]?.status).toBe("PENDING");
		expect(store.recovered[0]?.status).toBe("PENDING");
		expect(store.cash).toHaveLength(0);
		expect(store.workerStock["item-router|emp-1"]).toBeUndefined();
	});

	it("skips lines of a pending new-customer setup", async () => {
		store.installations = [
			installation(),
			installation({
				id: "inst-setup",
				setupRequestId: "setup-1",
				setupRequest: { status: "PENDING" },
			}),
		];

		const result = await call({ action: "approve" });

		expect(result.skipped.map((l) => l.id)).toEqual(["inst-setup"]);
		expect(
			store.installations.find((l) => l.id === "inst-setup")?.status,
		).toBe("PENDING");
		expect(store.workerStock["item-cable|emp-1"]?.quantity).toBe(22);
	});

	it("pushes add-on prices to iRadius before the transaction", async () => {
		store.installations = [
			installation({
				id: "inst-iptv",
				isAddOn: true,
				notes: "IPTV",
				price: 5,
				quantity: 1,
				stockItemId: null,
			}),
		];

		await call({ action: "approve" });

		expect(store.events).toEqual(["iradius", "transaction"]);
		expect(store.taskStatus).toBe("COMPLETED");
	});

	it("writes nothing when the add-on push fails", async () => {
		pushAddonPricesToIRadius.mockRejectedValueOnce(new Error("down"));
		store.installations = [
			installation({
				id: "inst-iptv",
				isAddOn: true,
				notes: "IPTV",
				price: 5,
				quantity: 1,
				stockItemId: null,
			}),
		];

		await expect(call({ action: "approve" })).rejects.toThrow();
		expect(store.events).not.toContain("transaction");
		expect(store.installations[0]?.status).toBe("PENDING");
		expect(store.taskStatus).toBe("PENDING_APPROVAL");
	});
});

describe("reviewTaskCompletion — reject", () => {
	it("reverts approved lines and denies pending ones", async () => {
		store.workerStock["item-cable|emp-1"] = { quantity: 22, unitPrice: 1 };
		store.cash = [{ installationId: "inst-1", amount: -20 }];
		store.installations = [
			installation({ status: "APPROVED" }),
			installation({ id: "inst-2" }),
		];

		await call({ action: "reject", note: "wrong photo" });

		expect(store.installations.map((l) => l.status)).toEqual([
			"DENIED",
			"DENIED",
		]);
		expect(store.workerStock["item-cable|emp-1"]?.quantity).toBe(24);
		expect(store.cash).toHaveLength(0);
		expect(store.taskStatus).toBe("OPEN");
	});

	it("refuses when approved recovered gear already left the worker's stock", async () => {
		store.recovered = [recovered({ status: "APPROVED" })];
		store.workerStock["item-router|emp-1"] = { quantity: 0, unitPrice: 25 };

		await expect(call({ action: "reject" })).rejects.toMatchObject({
			code: "CONFLICT",
		});
		expect(store.recovered[0]?.status).toBe("APPROVED");
		expect(store.taskStatus).toBe("PENDING_APPROVAL");
	});

	it("can keep approved recovered gear with keepRecovered", async () => {
		store.recovered = [recovered({ status: "APPROVED" })];
		store.workerStock["item-router|emp-1"] = { quantity: 0, unitPrice: 25 };

		await call({ action: "reject", keepRecovered: true });

		expect(store.recovered[0]?.status).toBe("APPROVED");
		expect(store.taskStatus).toBe("OPEN");
	});

	it("reports approved add-on prices it cannot restore", async () => {
		store.installations = [
			installation({
				id: "inst-iptv",
				status: "APPROVED",
				isAddOn: true,
				notes: "IPTV",
				price: 5,
				quantity: 1,
				stockItemId: null,
			}),
		];

		const result = await call({ action: "reject" });

		expect(result.addonPriceKept).toEqual([{ note: "IPTV", price: 5 }]);
		expect(store.installations[0]?.status).toBe("DENIED");
	});
});
