import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/database", () => ({
	db: { $queryRaw: vi.fn() },
}));

import { db } from "@repo/database";
import {
	customerIdsByPhone,
	customerSearchWhere,
	customerTokenWhere,
	looksLikePhone,
	memoizedPhoneIdLookup,
	phoneSearchDigits,
} from "../lib/customer-search";

const mockQueryRaw = vi.mocked(db.$queryRaw);

beforeEach(() => {
	mockQueryRaw.mockReset();
});

describe("looksLikePhone", () => {
	it.each([
		"03 353 794",
		"+961 81 394 966",
		"0096176547175",
		"547175",
		"3106469",
		"(03) 353-794",
	])("treats %s as a phone", (q) => {
		expect(looksLikePhone(q)).toBe(true);
	});

	it.each([
		"michell takla",
		"ACC-00097",
		"12345",
		"185.170.131.27",
		"user123456",
		"",
	])("does not treat %s as a phone", (q) => {
		expect(looksLikePhone(q)).toBe(false);
	});
});

describe("phoneSearchDigits", () => {
	it.each([
		["03 353 794", "3353794"],
		["+961 81 394 966", "81394966"],
		["0096176547175", "76547175"],
		["081394966", "81394966"],
		["547175", "547175"],
		["3106469", "3106469"],
	])("%s → %s", (q, digits) => {
		expect(phoneSearchDigits(q)).toBe(digits);
	});
});

describe("customerTokenWhere", () => {
	it("matches the token on name, username, account and phone columns", () => {
		const where = customerTokenWhere("takla");
		const fields = (where.OR ?? []).map((c) => Object.keys(c)[0]);
		expect(fields).toEqual([
			"firstName",
			"lastName",
			"username",
			"accountNumber",
			"mobile",
			"phone",
		]);
	});
});

describe("customerIdsByPhone", () => {
	it("queries with the national digits as a substring pattern", async () => {
		mockQueryRaw.mockResolvedValue([{ id: "c1" }, { id: "c2" }] as never);

		const ids = await customerIdsByPhone("org-1", "+961 81 394 966");

		expect(ids).toEqual(["c1", "c2"]);
		const [, organizationId, pattern] = mockQueryRaw.mock.calls[0] ?? [];
		expect(organizationId).toBe("org-1");
		expect(pattern).toBe("%81394966%");
	});

	it("skips the query when there are no digits", async () => {
		expect(await customerIdsByPhone("org-1", "  ")).toEqual([]);
		expect(mockQueryRaw).not.toHaveBeenCalled();
	});
});

describe("customerSearchWhere", () => {
	it("resolves a phone-shaped query to matching ids, plus username/account", async () => {
		mockQueryRaw.mockResolvedValue([{ id: "c97" }] as never);

		const where = await customerSearchWhere("org-1", " 03 353 794 ");

		expect(where).toEqual({
			OR: [
				{ id: { in: ["c97"] } },
				{ username: { contains: "03 353 794", mode: "insensitive" } },
				{
					accountNumber: {
						contains: "03 353 794",
						mode: "insensitive",
					},
				},
			],
		});
	});

	it("ANDs every token of a name search", async () => {
		const where = await customerSearchWhere("org-1", "michell  takla");

		expect(mockQueryRaw).not.toHaveBeenCalled();
		expect(where).toEqual({
			AND: [customerTokenWhere("michell"), customerTokenWhere("takla")],
		});
	});

	it("also matches a phone token of a mixed search on any of the customer's numbers", async () => {
		mockQueryRaw.mockResolvedValue([{ id: "c97" }] as never);

		const where = await customerSearchWhere("org-1", "takla 81394966");

		expect(mockQueryRaw).toHaveBeenCalledTimes(1);
		expect(where).toEqual({
			AND: [
				customerTokenWhere("takla"),
				customerTokenWhere("81394966", ["c97"]),
			],
		});
		expect(customerTokenWhere("81394966", ["c97"]).OR).toContainEqual({
			id: { in: ["c97"] },
		});
	});
});

describe("memoizedPhoneIdLookup", () => {
	it("runs each distinct phone scan once per request", async () => {
		mockQueryRaw.mockResolvedValue([{ id: "c97" }] as never);
		const lookup = memoizedPhoneIdLookup("org-1");

		await Promise.all([
			customerSearchWhere("org-1", "81394966", lookup),
			customerSearchWhere("org-1", "81394966", lookup),
		]);

		expect(mockQueryRaw).toHaveBeenCalledTimes(1);
	});
});
