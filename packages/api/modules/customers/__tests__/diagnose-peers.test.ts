import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockLiveExpiry } = vi.hoisted(() => ({
	mockDb: { customer: { findMany: vi.fn() } },
	mockLiveExpiry: vi.fn(),
}));

vi.mock("@repo/database", () => ({ db: mockDb }));
vi.mock("@repo/database/iradius", () => ({
	queryIRadiusExpiryByUsernames: mockLiveExpiry,
}));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@repo/api/lib/permission", () => ({
	getDealerScopeFilter: (id: string | null) => ({ dealerId: id }),
}));

import { enrichDiagnosePeers } from "../lib/diagnose-peers";

const NOW = new Date("2026-09-30T12:00:00Z");
const PAST = new Date("2026-09-01T20:55:00Z");
const FUTURE = new Date("2026-10-30T20:55:00Z");

const peers = [
	{ userName: "offline1", online: false },
	{ userName: "renewed", online: false },
	{ userName: "online1", online: true },
	{ userName: "otherdealer", online: false },
];

describe("enrichDiagnosePeers", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDb.customer.findMany.mockResolvedValue([
			{
				id: "c-off",
				username: "offline1",
				firstName: "Off",
				lastName: "Line",
				expiresAt: FUTURE,
			},
			{
				id: "c-ren",
				username: "renewed",
				firstName: "Re",
				lastName: null,
				// Stale local copy: expired, but iRadius says renewed.
				expiresAt: PAST,
			},
			{
				id: "c-on",
				username: "online1",
				firstName: null,
				lastName: null,
				expiresAt: FUTURE,
			},
		]);
	});

	it("prefers live iRadius expiry and sorts Online > Expired > Offline", async () => {
		mockLiveExpiry.mockResolvedValue(
			new Map([
				["offline1", PAST],
				["renewed", FUTURE],
				["online1", FUTURE],
			]),
		);
		const result = await enrichDiagnosePeers({
			organizationId: "org-1",
			activeDealerId: "dealer-1",
			peers,
			now: NOW,
		});
		expect(result.map((p) => [p.userName, p.expired])).toEqual([
			["online1", false],
			["offline1", true],
			["renewed", false],
			["otherdealer", false],
		]);
		expect(result[1]).toMatchObject({
			name: "Off Line",
			customerId: "c-off",
		});
	});

	it("falls back to the local expiry when iRadius can't be read", async () => {
		mockLiveExpiry.mockRejectedValue(new Error("tunnel down"));
		const result = await enrichDiagnosePeers({
			organizationId: "org-1",
			activeDealerId: null,
			peers,
			now: NOW,
		});
		const renewed = result.find((p) => p.userName === "renewed");
		expect(renewed?.expired).toBe(true);
	});

	it("scopes the name lookup to the viewer's dealer; others show username only", async () => {
		mockLiveExpiry.mockResolvedValue(new Map());
		const result = await enrichDiagnosePeers({
			organizationId: "org-1",
			activeDealerId: "dealer-1",
			peers,
			now: NOW,
		});
		expect(mockDb.customer.findMany.mock.calls[0]?.[0].where).toEqual({
			organizationId: "org-1",
			username: {
				in: ["offline1", "renewed", "online1", "otherdealer"],
			},
			deletedAt: null,
			dealerId: "dealer-1",
		});
		expect(result.find((p) => p.userName === "otherdealer")).toEqual({
			userName: "otherdealer",
			online: false,
			name: null,
			customerId: null,
			expiresAt: null,
			expired: false,
		});
	});

	it("skips all queries without peers", async () => {
		expect(
			await enrichDiagnosePeers({
				organizationId: "org-1",
				activeDealerId: null,
				peers: [],
			}),
		).toEqual([]);
		expect(mockDb.customer.findMany).not.toHaveBeenCalled();
		expect(mockLiveExpiry).not.toHaveBeenCalled();
	});
});
