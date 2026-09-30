import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock("@repo/database", () => ({ db: { customer: { findMany } } }));

import {
	findContactCustomers,
	resolveContactCustomer,
} from "./contact-customer";

const THREE = [
	{ id: "c1", status: "ACTIVE", username: "mohamadshaaban" },
	{ id: "c2", status: "ACTIVE", username: "mohamadshaabanhome" },
	{ id: "c3", status: "ACTIVE", username: "mohamadshaabanwork1" },
];

beforeEach(() => {
	findMany.mockReset();
});

describe("findContactCustomers", () => {
	it("returns every non-deleted match for the phone", async () => {
		findMany.mockResolvedValue(THREE);

		const matches = await findContactCustomers("org-1", "96171341878");

		expect(matches).toEqual(THREE);
		const args = findMany.mock.calls[0]?.[0];
		expect(args.where.organizationId).toBe("org-1");
		expect(args.where.deletedAt).toBeNull();
		expect(args.take).toBe(10);
	});

	it("returns nothing for a contact id with no phone digits", async () => {
		expect(await findContactCustomers("org-1", "")).toEqual([]);
		expect(findMany).not.toHaveBeenCalled();
	});
});

describe("resolveContactCustomer", () => {
	it("returns the single match", async () => {
		findMany.mockResolvedValue([THREE[0]]);
		expect(await resolveContactCustomer("org-1", "96171341878")).toEqual(
			THREE[0],
		);
	});

	it("returns null when more than one customer matches", async () => {
		findMany.mockResolvedValue(THREE.slice(0, 2));
		expect(await resolveContactCustomer("org-1", "96171341878")).toBeNull();
	});
});
