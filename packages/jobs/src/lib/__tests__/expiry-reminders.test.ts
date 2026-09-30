import { describe, expect, it, vi } from "vitest";

vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Real settlement / filter / phone helpers, fake Prisma client.
vi.mock("@repo/database", async () => ({
	...(await import("../../../../database/lib/settlement")),
	...(await import("../../../../database/lib/billing-filters")),
	...(await import("../../../../database/lib/phones")),
	db: {},
}));

vi.mock("../../jobs/customer-notify.jobs", () => ({
	queueCustomerNotifications: vi.fn(),
}));
vi.mock("../../jobs/telegram-notify.jobs", () => ({
	queueTelegramNotify: vi.fn(),
}));

import {
	expiryLabel,
	formatLocalPhone,
	pickContactPhone,
} from "../customer-notifications";
import {
	beirutTomorrowWindow,
	claimOrgReminders,
	findDueReminders,
	type ReminderOrg,
} from "../expiry-reminders";

describe("beirutTomorrowWindow", () => {
	it("covers tomorrow's Beirut calendar day in summer (+3)", () => {
		expect(beirutTomorrowWindow(new Date("2026-09-30T07:00:00Z"))).toEqual({
			gte: new Date("2026-09-30T21:00:00Z"),
			lt: new Date("2026-10-01T21:00:00Z"),
		});
	});

	it("uses tomorrow even late in the Beirut evening", () => {
		// 23:30 Beirut on 30 Sep → tomorrow is 1 Oct.
		expect(
			beirutTomorrowWindow(new Date("2026-09-30T20:30:00Z")).gte,
		).toEqual(new Date("2026-09-30T21:00:00Z"));
	});

	it("handles the 2026-10-25 DST change (25-hour day ending at +2)", () => {
		const { gte, lt } = beirutTomorrowWindow(
			new Date("2026-10-24T07:00:00Z"),
		);
		expect(lt).toEqual(new Date("2026-10-25T22:00:00Z"));
		expect(gte.getTime()).toBeLessThanOrEqual(
			new Date("2026-10-24T22:00:00Z").getTime(),
		);
		// A normal 23:59 Beirut (+2) expiry on 25 Oct is inside.
		const expiry = new Date("2026-10-25T21:59:00Z");
		expect(expiry >= gte && expiry < lt).toBe(true);
	});

	it("catches iRadius 23:55 winter expiries stored as 21:55 UTC", () => {
		const { gte, lt } = beirutTomorrowWindow(
			new Date("2026-10-31T08:00:00Z"),
		);
		const expiry = new Date("2026-11-01T21:55:00Z");
		expect(expiry >= gte && expiry < lt).toBe(true);
		expect(expiryLabel(expiry)).toBe("(1/11/2026)");
	});
});

describe("expiryLabel", () => {
	it("renders the Beirut date of a 23:59 expiry", () => {
		expect(expiryLabel(new Date("2026-09-30T20:59:00Z"))).toBe(
			"(30/9/2026)",
		);
	});
});

describe("contact phone", () => {
	it("formats Lebanese numbers the local way", () => {
		expect(formatLocalPhone("+96176878870")).toBe("76 878 870");
		expect(formatLocalPhone("03775126")).toBe("03 775 126");
		expect(formatLocalPhone("9613775126")).toBe("03 775 126");
		expect(formatLocalPhone("+33612345678")).toBe("+33612345678");
		expect(formatLocalPhone("collector")).toBeNull();
		expect(formatLocalPhone(null)).toBeNull();
	});

	it("takes the first usable candidate in order", () => {
		expect(
			pickContactPhone([null, "not a phone", "76878870", "03775126"]),
		).toBe("76 878 870");
		expect(pickContactPhone([undefined, "", null])).toBeNull();
	});
});

// ── findDueReminders ──────────────────────────────────────────────────────

const NOW = new Date("2026-09-30T07:00:00Z");
const TOMORROW_EXPIRY = new Date("2026-10-01T20:59:00Z");

interface FakePayment {
	customerId: string;
	billingMonthId: string;
	paidAmount: number;
	discount: number;
	freeAccount: boolean;
	stoppedAccount: boolean;
	debtAccount: boolean;
	paidAt: Date;
}

function customer(overrides: Record<string, unknown> = {}) {
	return {
		phones: [{ number: "+96170111222", primary: true }],
		mobile: null,
		phone: null,
		collectorPhone: null,
		collector: { name: "sadek", phone: "+96176878870" },
		...overrides,
	};
}

function invoice(id: string, customerId: string, overrides = {}) {
	return {
		id,
		customerId,
		year: 2026,
		month: 9,
		total: 30,
		totalWithTax: 0,
		expiryDate: TOMORROW_EXPIRY,
		customer: customer(),
		...overrides,
	};
}

function fakeClient(opts: {
	invoices: ReturnType<typeof invoice>[];
	payments?: FakePayment[];
	suppressed?: string[];
	months?: Array<{
		id: string;
		year: number;
		month: number;
		locked: boolean;
	}>;
}) {
	return {
		billingMonth: {
			findMany: vi.fn(
				async () =>
					opts.months ?? [
						{ id: "bm-aug", year: 2026, month: 8, locked: true },
						{ id: "bm-sep", year: 2026, month: 9, locked: false },
					],
			),
		},
		customerInvoice: { findMany: vi.fn(async () => opts.invoices) },
		payment: {
			// Honour the COVERING_PAYMENT flags like Postgres would.
			findMany: vi.fn(
				async ({
					where,
				}: {
					where: { stoppedAccount: boolean; debtAccount: boolean };
				}) =>
					(opts.payments ?? []).filter(
						(p) =>
							p.stoppedAccount === where.stoppedAccount &&
							p.debtAccount === where.debtAccount,
					),
			),
		},
		marketingSuppression: {
			findMany: vi.fn(async () =>
				(opts.suppressed ?? []).map((phone) => ({ phone })),
			),
		},
		customerNotification: {
			createMany: vi.fn(async ({ data }: { data: unknown[] }) => ({
				count: data.length,
			})),
			findMany: vi.fn(async () => [{ id: "n1" }]),
		},
	};
}

type Client = Parameters<typeof findDueReminders>[2];

const org: ReminderOrg = {
	id: "org-1",
	activeDealerId: "dealer-1",
	reminderFallbackPhone: null,
	activeDealer: { whatsappPhone: null, companyMobile: null },
};

function payment(
	customerId: string,
	overrides: Partial<FakePayment> = {},
): FakePayment {
	return {
		customerId,
		billingMonthId: "bm-sep",
		paidAmount: 0,
		discount: 0,
		freeAccount: false,
		stoppedAccount: false,
		debtAccount: false,
		paidAt: new Date("2026-09-20T10:00:00Z"),
		...overrides,
	};
}

describe("findDueReminders", () => {
	it("selects on the invoice expiryDate window with the billing filters", async () => {
		const client = fakeClient({ invoices: [] });
		await findDueReminders(org, NOW, client as unknown as Client);

		const where = (
			client.customerInvoice.findMany.mock.calls[0] as unknown as [
				{ where: Record<string, unknown> },
			]
		)[0].where;
		expect(where["expiryDate"]).toEqual(beirutTomorrowWindow(NOW));
		expect(where["voidedAt"]).toBeNull();
		expect(where["OR"]).toEqual([
			{ year: 2026, month: 8 },
			{ year: 2026, month: 9 },
		]);
		expect(where["customer"]).toMatchObject({
			deletedAt: null,
			status: { in: ["ACTIVE"] },
			dealerId: "dealer-1",
			AND: [
				{
					OR: [
						{ groupName: null },
						{
							NOT: {
								groupName: {
									equals: "free",
									mode: "insensitive",
								},
							},
						},
					],
				},
			],
			NOT: {
				payments: {
					some: {
						billingMonthId: { in: ["bm-aug", "bm-sep"] },
						stoppedAccount: true,
						reviewedAt: null,
					},
				},
			},
		});
	});

	it("stops at the active month and never opens one", async () => {
		const client = fakeClient({
			invoices: [invoice("inv-1", "c1")],
			months: [{ id: "bm-sep", year: 2026, month: 9, locked: true }],
		});
		expect(
			await findDueReminders(org, NOW, client as unknown as Client),
		).toEqual([]);
		expect(client.customerInvoice.findMany).not.toHaveBeenCalled();
	});

	it("reminds unpaid, partial and debt-only customers; not paid or free-waived", async () => {
		const client = fakeClient({
			invoices: [
				invoice("inv-unpaid", "unpaid"),
				invoice("inv-partial", "partial"),
				invoice("inv-paid", "paid"),
				invoice("inv-free", "free"),
				invoice("inv-debt", "debt"),
				invoice("inv-discount", "discount"),
			],
			payments: [
				payment("partial", { paidAmount: 10 }),
				payment("paid", { paidAmount: 30 }),
				payment("free", { freeAccount: true }),
				payment("debt", { debtAccount: true }),
				payment("discount", { paidAmount: 25, discount: 5 }),
			],
		});

		const due = await findDueReminders(
			org,
			NOW,
			client as unknown as Client,
		);

		expect(due.map((d) => d.invoiceId).sort()).toEqual([
			"inv-debt",
			"inv-partial",
			"inv-unpaid",
		]);
		expect(due[0]).toMatchObject({
			customerPhone: "+96170111222",
			contactPhone: "76 878 870",
			expiryLabel: "(1/10/2026)",
			skipReason: null,
		});
	});

	it("falls back collector → customer snapshot → office → dealer, then skips", async () => {
		const client = fakeClient({
			invoices: [
				invoice("a", "a", {
					customer: customer({
						collector: { name: "sadek", phone: null },
						collectorPhone: "03775126",
					}),
				}),
				invoice("b", "b", {
					customer: customer({
						collector: { name: "sadek", phone: null },
					}),
				}),
				invoice("c", "c", { customer: customer({ collector: null }) }),
			],
		});

		const withOffice = await findDueReminders(
			{ ...org, reminderFallbackPhone: "01234567" },
			NOW,
			client as unknown as Client,
		);
		expect(withOffice.map((d) => d.contactPhone)).toEqual([
			"03 775 126",
			"01 234 567",
			"01 234 567",
		]);

		const withDealer = await findDueReminders(
			{
				...org,
				activeDealer: {
					whatsappPhone: null,
					companyMobile: "71 999 888",
				},
			},
			NOW,
			client as unknown as Client,
		);
		expect(withDealer[1]?.contactPhone).toBe("71 999 888");

		const none = await findDueReminders(
			org,
			NOW,
			client as unknown as Client,
		);
		expect(none[1]).toMatchObject({
			contactPhone: null,
			skipReason: "no contact phone (collector: sadek)",
		});
		expect(none[2]?.skipReason).toBe("no contact phone (no collector)");
	});

	it("marks opted-out phones as skipped", async () => {
		const client = fakeClient({
			invoices: [invoice("inv-1", "c1")],
			suppressed: ["96170111222"],
		});
		const [due] = await findDueReminders(
			org,
			NOW,
			client as unknown as Client,
		);
		expect(due?.skipReason).toBe("opted out");
	});
});

describe("claimOrgReminders", () => {
	it("claims one row per channel with skipDuplicates and queues the queued ones", async () => {
		const client = fakeClient({
			invoices: [
				invoice("inv-1", "c1"),
				invoice("inv-2", "c2", {
					customer: customer({
						phones: [{ number: "+33612345678", primary: true }],
					}),
				}),
			],
		});

		const result = await claimOrgReminders(
			{ ...org, expiryReminderWhatsapp: true, expiryReminderSms: true },
			NOW,
			client as unknown as Client,
		);

		const call = client.customerNotification.createMany.mock.calls[0] as
			| [
					{
						data: Array<Record<string, unknown>>;
						skipDuplicates: boolean;
					},
			  ]
			| undefined;
		expect(call?.[0].skipDuplicates).toBe(true);
		const rows = call?.[0].data ?? [];
		expect(rows).toHaveLength(4);
		expect(rows[0]).toMatchObject({
			invoiceId: "inv-1",
			kind: "expiry_reminder",
			channel: "whatsapp",
			phone: "96170111222",
			templateName: "payment_reminder_tomorrow",
			body: JSON.stringify(["(1/10/2026)", "76 878 870"]),
			status: "queued",
		});
		expect(rows[1]).toMatchObject({ channel: "sms", status: "queued" });
		expect(String(rows[1]?.["body"])).toContain("76 878 870");
		// Foreign number: WhatsApp only.
		expect(rows[3]).toMatchObject({
			channel: "sms",
			status: "skipped",
			error: "not a Lebanese number (WhatsApp only)",
		});
		expect(result).toEqual({ claimed: 4, queued: ["n1"] });
	});

	it("does nothing when both channels are off", async () => {
		const client = fakeClient({ invoices: [invoice("inv-1", "c1")] });
		const result = await claimOrgReminders(
			{ ...org, expiryReminderWhatsapp: false, expiryReminderSms: false },
			NOW,
			client as unknown as Client,
		);
		expect(result).toEqual({ claimed: 0, queued: [] });
		expect(client.customerNotification.createMany).not.toHaveBeenCalled();
	});
});
