import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockDb,
	mockVerifyApiKey,
	mockCheckRateLimit,
	mockResetMac,
	mockMacResetAudit,
} = vi.hoisted(() => ({
	mockDb: {
		organization: { findUnique: vi.fn() },
		customer: { findFirst: vi.fn(), update: vi.fn() },
	},
	mockVerifyApiKey: vi.fn(),
	mockCheckRateLimit: vi.fn(),
	mockResetMac: vi.fn(),
	mockMacResetAudit: vi.fn(),
}));

vi.mock("@repo/database", () => ({ db: mockDb }));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@repo/rate-limit", () => ({ checkRateLimit: mockCheckRateLimit }));
vi.mock("@repo/auth/lib/audit", () => ({
	customerAudit: { macReset: mockMacResetAudit },
}));
vi.mock("../lib/iradius-api", () => ({
	iradiusResetMacAddress: mockResetMac,
}));
vi.mock("../../api-keys/lib/verify", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("../../api-keys/lib/verify")>();
	return { ...actual, verifyApiKey: mockVerifyApiKey };
});

import { customerResetMacHandler } from "../lib/reset-mac-handler";

const ORG_ID = "org-1";

function request(body: unknown, key = "libancom_test"): Request {
	return new Request(
		"https://cp.example.com/api/customer-reset-mac/liban-com",
		{
			method: "POST",
			headers: { "x-api-key": key, "content-type": "application/json" },
			body: JSON.stringify(body),
		},
	);
}

const BODY = {
	customer_username: "salehatah",
	telegram_id: 5795384135,
	telegram_name: "Jhonny",
};

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

describe("customerResetMacHandler", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDb.organization.findUnique.mockImplementation(
			(args: { where: { slug?: string } }) =>
				Promise.resolve(
					args.where.slug
						? { id: ORG_ID }
						: { iradiusDisabled: false },
				),
		);
		mockCheckRateLimit.mockResolvedValue({ allowed: true, retryAfter: 0 });
		mockDb.customer.findFirst.mockResolvedValue({
			id: "c1",
			externalId: "4242",
			macAddress: "AA:BB:CC:DD:EE:FF",
		});
		mockDb.customer.update.mockResolvedValue({});
		mockResetMac.mockResolvedValue({ affectedRows: 1 });
	});

	it("401s an invalid key", async () => {
		mockVerifyApiKey.mockResolvedValue({ valid: false, error: "nope" });
		const res = await customerResetMacHandler(request(BODY), "liban-com");
		expect(res.status).toBe(401);
	});

	it("403s a key without write:customer-mac", async () => {
		validKey(["write:tasks", "read:customers"]);
		const res = await customerResetMacHandler(request(BODY), "liban-com");
		expect(res.status).toBe(403);
		expect(mockResetMac).not.toHaveBeenCalled();
	});

	it("403s a key from another organization", async () => {
		validKey(["write:customer-mac"]);
		mockDb.organization.findUnique.mockResolvedValue({ id: "other" });
		const res = await customerResetMacHandler(request(BODY), "liban-com");
		expect(res.status).toBe(403);
	});

	it("404s an unlinked customer without touching iRadius", async () => {
		validKey(["write:customer-mac"]);
		mockDb.customer.findFirst.mockResolvedValue({
			id: "c1",
			externalId: null,
			macAddress: null,
		});
		const res = await customerResetMacHandler(request(BODY), "liban-com");
		expect(res.status).toBe(404);
		expect(mockResetMac).not.toHaveBeenCalled();
	});

	it("leaves the local row untouched when iRadius fails", async () => {
		validKey(["write:*"]);
		mockResetMac.mockRejectedValue(new Error("ECONNRESET"));
		const res = await customerResetMacHandler(request(BODY), "liban-com");
		expect(res.status).toBe(502);
		expect(await res.json()).toEqual({
			success: false,
			error: "Failed to reset MAC address in iRadius",
		});
		expect(mockDb.customer.update).not.toHaveBeenCalled();
		expect(mockMacResetAudit).not.toHaveBeenCalled();
	});

	it("resets remote-first, clears the local MAC, audits with Telegram identity", async () => {
		validKey(["write:customer-mac"]);
		const res = await customerResetMacHandler(request(BODY), "liban-com");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			success: true,
			username: "salehatah",
		});
		expect(mockResetMac).toHaveBeenCalledWith({
			id: "c1",
			externalId: "4242",
		});
		expect(mockDb.customer.update).toHaveBeenCalledWith({
			where: { id: "c1" },
			data: { macAddress: null },
		});
		expect(mockMacResetAudit).toHaveBeenCalledWith(
			"c1",
			"user-1",
			ORG_ID,
			{},
			{
				via: "telegram",
				telegramId: "5795384135",
				telegramName: "Jhonny",
				previousMac: "AA:BB:CC:DD:EE:FF",
			},
		);
		expect(mockDb.customer.findFirst.mock.calls[0]?.[0].where).toEqual({
			organizationId: ORG_ID,
			username: "salehatah",
			deletedAt: null,
		});
	});
});
