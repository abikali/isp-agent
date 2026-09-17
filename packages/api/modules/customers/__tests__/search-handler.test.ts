import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockVerifyApiKey, mockCheckRateLimit } = vi.hoisted(() => ({
	mockDb: {
		organization: { findUnique: vi.fn() },
		$queryRaw: vi.fn(),
		customer: {
			findMany: vi.fn(),
			count: vi.fn(),
		},
	},
	mockVerifyApiKey: vi.fn(),
	mockCheckRateLimit: vi.fn(),
}));

vi.mock("@repo/database", () => ({ db: mockDb }));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@repo/rate-limit", () => ({ checkRateLimit: mockCheckRateLimit }));
vi.mock("../../api-keys/lib/verify", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("../../api-keys/lib/verify")>();
	return { ...actual, verifyApiKey: mockVerifyApiKey };
});

import { customerSearchHandler } from "../lib/search-handler";

const ORG_ID = "org-1";

function request(query: string, key = "libancom_test"): Request {
	return new Request(
		`https://cp.example.com/api/customer-search/liban-com?${query}`,
		{ headers: { "x-api-key": key } },
	);
}

function validKey(permissions: string[]) {
	mockVerifyApiKey.mockResolvedValue({
		valid: true,
		apiKey: {
			id: "key-1",
			name: "tg bot",
			organizationId: ORG_ID,
			permissions,
			createdById: "user-1",
		},
	});
}

function detail(id: string, firstName: string, username: string) {
	return {
		id,
		username,
		firstName,
		lastName: "Hajj Hassan",
		mobile: "76123456",
		groupName: "sabtiye",
		status: "ACTIVE",
		online: true,
		expiresAt: new Date("2026-10-01T20:55:00Z"),
		accountNumber: "ACC-00042",
		station: { name: "Station A" },
		plan: { name: "Basic" },
		dealer: { name: "Liban-Com" },
	};
}

describe("customerSearchHandler", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDb.organization.findUnique.mockResolvedValue({ id: ORG_ID });
		mockCheckRateLimit.mockResolvedValue({ allowed: true, retryAfter: 0 });
	});

	it("401s an invalid key", async () => {
		mockVerifyApiKey.mockResolvedValue({ valid: false, error: "nope" });
		const res = await customerSearchHandler(request("q=ali"), "liban-com");
		expect(res.status).toBe(401);
	});

	it("403s a key without read:customers (write:* is not enough)", async () => {
		validKey(["write:*"]);
		const res = await customerSearchHandler(request("q=ali"), "liban-com");
		expect(res.status).toBe(403);
	});

	it("403s a key from another organization", async () => {
		validKey(["read:customers"]);
		mockDb.organization.findUnique.mockResolvedValue({ id: "other-org" });
		const res = await customerSearchHandler(request("q=ali"), "liban-com");
		expect(res.status).toBe(403);
	});

	it("429s when the key is over its rate limit", async () => {
		validKey(["read:customers"]);
		mockCheckRateLimit.mockResolvedValue({
			allowed: false,
			retryAfter: 12,
		});
		const res = await customerSearchHandler(request("q=ali"), "liban-com");
		expect(res.status).toBe(429);
		expect(res.headers.get("Retry-After")).toBe("12");
	});

	it("400s a too-short or too-wordy query", async () => {
		validKey(["read:*"]);
		expect(
			(await customerSearchHandler(request("q=a"), "liban-com")).status,
		).toBe(400);
		expect(
			(
				await customerSearchHandler(
					request("q=a+b+c+d+e+f+g"),
					"liban-com",
				)
			).status,
		).toBe(400);
	});

	it("ranks name matches and returns the page with details", async () => {
		validKey(["read:customers", "write:tasks"]);
		mockDb.customer.findMany
			.mockResolvedValueOnce([
				{
					id: "c1",
					firstName: "Ali",
					lastName: "Hajj Hassan",
					username: "alihajjhasan",
					status: "ACTIVE",
					online: true,
				},
				{
					id: "c2",
					firstName: "Rami",
					lastName: "Khoury",
					username: "rkhoury",
					status: "ACTIVE",
					online: false,
				},
			])
			.mockResolvedValueOnce([detail("c1", "Ali", "alihajjhasan")]);

		const res = await customerSearchHandler(
			request("q=haj%20hassan"),
			"liban-com",
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("Cache-Control")).toBe("no-store");
		const body = await res.json();
		expect(body.total).toBe(1);
		expect(body.results).toEqual([
			{
				username: "alihajjhasan",
				name: "Ali Hajj Hassan",
				mobile: "76123456",
				area: "sabtiye",
				station: "Station A",
				plan: "Basic",
				status: "ACTIVE",
				online: true,
				expiresAt: "2026-10-01T20:55:00.000Z",
				dealer: "Liban-Com",
				accountNumber: "ACC-00042",
				matchedOn: "name",
				score: 60,
			},
		]);

		// Whole org, not dealer-scoped; soft-deleted rows excluded.
		const candidateWhere =
			mockDb.customer.findMany.mock.calls[0]?.[0].where;
		expect(candidateWhere.organizationId).toBe(ORG_ID);
		expect(candidateWhere.deletedAt).toBeNull();
		expect(candidateWhere).not.toHaveProperty("dealerId");
	});

	it("routes 6+ digit queries to the phone lookup", async () => {
		validKey(["*"]);
		mockDb.$queryRaw.mockResolvedValue([{ id: "c1" }]);
		mockDb.customer.count.mockResolvedValue(1);
		mockDb.customer.findMany.mockResolvedValue([
			detail("c1", "Ali", "alihajjhasan"),
		]);
		const res = await customerSearchHandler(
			request("q=76%20123%20456"),
			"liban-com",
		);
		const body = await res.json();
		expect(body.results[0].matchedOn).toBe("phone");
		expect(mockDb.customer.findMany).toHaveBeenCalledTimes(1);
		// Resolved through the shared digits-only scan of every stored number.
		expect(mockDb.$queryRaw).toHaveBeenCalledTimes(1);
		expect(mockDb.customer.findMany.mock.calls[0]?.[0].where.id).toEqual({
			in: ["c1"],
		});
	});

	it("routes ACC- queries to the account number lookup", async () => {
		validKey(["read:customers"]);
		mockDb.customer.count.mockResolvedValue(1);
		mockDb.customer.findMany.mockResolvedValue([
			detail("c1", "Ali", "alihajjhasan"),
		]);
		const res = await customerSearchHandler(
			request("q=ACC-00042"),
			"liban-com",
		);
		const body = await res.json();
		expect(body.results[0].matchedOn).toBe("account");
		expect(
			mockDb.customer.findMany.mock.calls[0]?.[0].where.accountNumber,
		).toEqual({ contains: "ACC-00042", mode: "insensitive" });
	});
});
