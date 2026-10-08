import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	customerFindMany: vi.fn(),
	suppressionFindMany: vi.fn(),
}));

vi.mock("@repo/database", () => ({
	db: {
		customer: { findMany: mocks.customerFindMany },
		marketingSuppression: { findMany: mocks.suppressionFindMany },
	},
}));
vi.mock("@repo/api/lib/permission", () => ({
	getOwnershipFilterAsync: vi.fn(async () => ({})),
	getDealerScopeFilter: vi.fn(() => ({})),
}));

import {
	finalizeRecipients,
	type MaterializedRecipient,
	materializeAudience,
	normalizeMarketingPhone,
} from "../lib/audience";
import { scheduledAtSchema } from "../lib/schedule";

function recipient(phone: string, name: string): MaterializedRecipient {
	return { customerId: name, phone, contactName: name, variables: {} };
}

function customer(
	id: string,
	fields: { mobile?: string; phone?: string; phones?: unknown },
) {
	return {
		id,
		firstName: id,
		lastName: null,
		accountNumber: id,
		username: id,
		mobile: fields.mobile ?? null,
		phone: fields.phone ?? null,
		phones: fields.phones ?? null,
	};
}

const permCtx = {} as never;

describe("finalizeRecipients", () => {
	it("keeps the first row per phone and counts the rest as duplicates", () => {
		const result = finalizeRecipients(
			[
				recipient("9613111111", "a"),
				recipient("9613222222", "b"),
				recipient("9613111111", "c"),
				recipient("9613111111", "d"),
			],
			new Set(),
		);
		expect(result.recipients.map((r) => r.contactName)).toEqual(["a", "b"]);
		expect(result.duplicateCount).toBe(2);
		expect(result.suppressedCount).toBe(0);
	});

	it("drops opted-out phones once per distinct phone", () => {
		const result = finalizeRecipients(
			[
				recipient("9613111111", "a"),
				recipient("9613111111", "b"),
				recipient("9613222222", "c"),
			],
			new Set(["9613111111"]),
		);
		expect(result.recipients.map((r) => r.contactName)).toEqual(["c"]);
		expect(result.duplicateCount).toBe(1);
		expect(result.suppressedCount).toBe(1);
	});
});

describe("normalizeMarketingPhone", () => {
	it("maps the storage shapes of one Lebanese number to the same key", () => {
		const shapes = [
			"03 123 456",
			"+961 3 123 456",
			"9613123456",
			"3123456",
		];
		const keys = new Set(shapes.map(normalizeMarketingPhone));
		expect(keys).toEqual(new Set(["9613123456"]));
	});

	it("rejects inputs too short to be a phone", () => {
		expect(normalizeMarketingPhone("12-3")).toBeNull();
	});
});

describe("materializeAudience", () => {
	beforeEach(() => {
		mocks.customerFindMany.mockReset();
		mocks.suppressionFindMany.mockReset();
	});

	it("sends one message per distinct phone and skips opt-outs for ISP customers", async () => {
		mocks.customerFindMany.mockResolvedValue([
			customer("owner", { mobile: "03123456" }),
			// Second account of the same owner, stored in another shape.
			customer("owner-2", { mobile: "+9613123456" }),
			customer("json-only", {
				phones: [{ number: "71 000 000" }],
			}),
			customer("opted-out", { phone: "76555444" }),
			customer("no-phone", {}),
		]);
		mocks.suppressionFindMany.mockResolvedValue([{ phone: "96176555444" }]);

		const result = await materializeAudience({
			organizationId: "org",
			permCtx,
			activeDealerId: null,
			audience: {
				type: "isp_customers",
				statuses: [],
				planIds: [],
				excludePlanIds: [],
				stationIds: [],
				collectorIds: [],
				groupNames: [],
				connectionTypes: [],
			},
		});

		expect(result.recipients.map((r) => [r.customerId, r.phone])).toEqual([
			["owner", "9613123456"],
			["json-only", "96171000000"],
		]);
		expect(result.duplicateCount).toBe(1);
		expect(result.suppressedCount).toBe(1);
		expect(new Set(result.recipients.map((r) => r.phone)).size).toBe(
			result.recipients.length,
		);
	});

	it("never picks a landline as the WhatsApp number and filters on the landline answer", async () => {
		mocks.customerFindMany.mockResolvedValue([
			customer("landline-first", {
				mobile: "+9611680979",
				phones: [{ number: "+9611680979" }, { number: "+96176321501" }],
			}),
			customer("landline-only", { phones: [{ number: "04 123456" }] }),
		]);
		mocks.suppressionFindMany.mockResolvedValue([]);

		const result = await materializeAudience({
			organizationId: "org",
			permCtx,
			activeDealerId: null,
			audience: {
				type: "isp_customers",
				statuses: [],
				planIds: [],
				excludePlanIds: [],
				stationIds: [],
				collectorIds: [],
				groupNames: [],
				connectionTypes: [],
				landline: "yes",
			},
		});

		expect(result.recipients.map((r) => [r.customerId, r.phone])).toEqual([
			["landline-first", "96176321501"],
		]);
		const where = mocks.customerFindMany.mock.calls[0]?.[0]?.where;
		expect(where.hasLandline).toBe(true);
	});

	it("keeps plan-less customers when excluding plans", async () => {
		mocks.customerFindMany.mockResolvedValue([]);

		await materializeAudience({
			organizationId: "org",
			permCtx,
			activeDealerId: null,
			audience: {
				type: "isp_customers",
				statuses: ["ACTIVE"],
				planIds: [],
				excludePlanIds: ["plan-top"],
				stationIds: [],
				collectorIds: ["none", "col-1"],
				groupNames: [],
				connectionTypes: [],
			},
		});

		const where = mocks.customerFindMany.mock.calls[0]?.[0]?.where;
		expect(where.AND).toHaveLength(2);
		expect(where.AND).toEqual(
			expect.arrayContaining([
				{ OR: [{ planId: null }, { planId: { notIn: ["plan-top"] } }] },
				{
					OR: [
						{ collectorId: null },
						{ collectorId: { in: ["col-1"] } },
					],
				},
			]),
		);
		expect(where.planId).toBeUndefined();
		// No customers → no suppression lookup needed.
		expect(mocks.suppressionFindMany).not.toHaveBeenCalled();
	});

	it("dedupes CSV rows by normalised phone", async () => {
		mocks.suppressionFindMany.mockResolvedValue([]);
		const result = await materializeAudience({
			organizationId: "org",
			permCtx,
			activeDealerId: null,
			audience: {
				type: "csv",
				rows: [
					{ phone: "03123456", name: "Jad", variables: {} },
					{
						phone: "+961 3 123 456",
						name: "Jad again",
						variables: {},
					},
				],
			},
		});
		expect(result.recipients).toHaveLength(1);
		expect(result.recipients[0]?.contactName).toBe("Jad");
		expect(result.duplicateCount).toBe(1);
	});
});

describe("scheduledAtSchema", () => {
	it("accepts a future time and rejects past or far-future ones", () => {
		const hour = 3_600_000;
		expect(
			scheduledAtSchema.safeParse(new Date(Date.now() + hour)).success,
		).toBe(true);
		expect(
			scheduledAtSchema.safeParse(new Date(Date.now() - hour)).success,
		).toBe(false);
		expect(
			scheduledAtSchema.safeParse(new Date(Date.now() + 90 * 24 * hour))
				.success,
		).toBe(false);
	});
});
