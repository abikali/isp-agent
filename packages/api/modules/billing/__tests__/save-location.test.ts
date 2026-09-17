import { ORPCError } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/database", () => ({
	db: {
		customer: {
			findFirst: vi.fn(),
			update: vi.fn(),
		},
	},
}));

vi.mock("@repo/auth/lib/audit", () => ({
	customerAudit: { updated: vi.fn() },
	getAuditContextFromHeaders: vi.fn(() => ({})),
}));

vi.mock("@repo/api/lib/permission", () => ({
	requirePermission: vi.fn(),
	resolveCollectorScope: vi.fn(),
	getDealerScopeFilter: vi.fn(() => ({})),
}));

vi.mock("../../customers/lib/iradius-api", () => ({
	iradiusChangeCollector: vi.fn(),
	iradiusSetDeductMoney: vi.fn(),
	iradiusSetIptvPrice: vi.fn(),
	iradiusSetRealIpPrice: vi.fn(),
	iradiusSetRecurringDiscount: vi.fn(),
	iradiusUpdateUserAddress: vi.fn(),
	iradiusUpdateUserComment: vi.fn(),
	iradiusUpdateUserEmail: vi.fn(),
	iradiusUpdateUserGroup: vi.fn(),
	iradiusUpdateUserLocation: vi.fn(),
	iradiusUpdateUserName: vi.fn(),
	iradiusUpdateUserPhones: vi.fn(),
}));

import {
	requirePermission,
	resolveCollectorScope,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { iradiusUpdateUserLocation } from "../../customers/lib/iradius-api";
import { saveLocation } from "../procedures/save-location";

const mockDb = vi.mocked(db);
const mockRequirePermission = vi.mocked(requirePermission);
const mockResolveCollectorScope = vi.mocked(resolveCollectorScope);
const mockIRadiusLocation = vi.mocked(iradiusUpdateUserLocation);

const user = { id: "user-1" };
const orgId = "org-1";

function allow(iradiusDisabled = false) {
	mockRequirePermission.mockResolvedValue({
		member: {} as never,
		permCtx: {} as never,
		activeDealerId: null,
		iradiusDisabled,
	});
}

const CUSTOMER = {
	id: "cust-1",
	externalId: "84000",
	firstName: "Samir",
	lastName: null,
	email: null,
	address: null,
	phones: [],
	groupExternalId: null,
	collectorId: "emp-1",
	latitude: 42.885994,
	longitude: 0.000008,
	notes: null,
};

const INPUT = {
	organizationId: orgId,
	customerId: "cust-1",
	latitude: 33.8938,
	longitude: 35.5018,
};

async function call(input: unknown) {
	return (
		saveLocation as unknown as {
			"~orpc": { handler: (args: unknown) => Promise<unknown> };
		}
	)["~orpc"].handler({ context: { user }, input });
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("billing.location.save", () => {
	it("pushes the pin to iRadius before writing it locally", async () => {
		allow();
		mockResolveCollectorScope.mockResolvedValue({
			scope: "all",
			employeeId: null,
		});
		mockDb.customer.findFirst.mockResolvedValue(CUSTOMER as never);
		const order: string[] = [];
		mockIRadiusLocation.mockImplementation(async () => {
			order.push("iradius");
			return { affectedRows: 1 };
		});
		mockDb.customer.update.mockImplementation((async () => {
			order.push("local");
			return { id: "cust-1" };
		}) as never);

		await call(INPUT);

		expect(mockRequirePermission).toHaveBeenCalledWith(
			orgId,
			user.id,
			"billing",
			"collect",
		);
		expect(mockIRadiusLocation).toHaveBeenCalledWith(
			{ externalId: "84000" },
			33.8938,
			35.5018,
		);
		expect(order).toEqual(["iradius", "local"]);
	});

	it("skips the local write when iRadius fails", async () => {
		allow();
		mockResolveCollectorScope.mockResolvedValue({
			scope: "all",
			employeeId: null,
		});
		mockDb.customer.findFirst.mockResolvedValue(CUSTOMER as never);
		mockIRadiusLocation.mockRejectedValue(new Error("tunnel down"));

		await expect(call(INPUT)).rejects.toThrow(ORPCError);
		expect(mockDb.customer.update).not.toHaveBeenCalled();
	});

	it("limits an own-scope collector to their assigned customers", async () => {
		allow();
		mockResolveCollectorScope.mockResolvedValue({
			scope: "own",
			employeeId: "emp-2",
		});
		mockDb.customer.findFirst.mockResolvedValue(null);

		await expect(call(INPUT)).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(mockDb.customer.findFirst).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({ collectorId: "emp-2" }),
			}),
		);
		expect(mockIRadiusLocation).not.toHaveBeenCalled();
		expect(mockDb.customer.update).not.toHaveBeenCalled();
	});

	it("rejects a near-zero pin before touching anything", async () => {
		allow();

		await expect(
			call({ ...INPUT, longitude: 0.000008 }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mockDb.customer.findFirst).not.toHaveBeenCalled();
	});

	it("writes locally only when iRadius is disabled for the org", async () => {
		allow(true);
		mockResolveCollectorScope.mockResolvedValue({
			scope: "all",
			employeeId: null,
		});
		mockDb.customer.findFirst.mockResolvedValue(CUSTOMER as never);
		mockDb.customer.update.mockResolvedValue({ id: "cust-1" } as never);

		await call(INPUT);

		expect(mockIRadiusLocation).not.toHaveBeenCalled();
		expect(mockDb.customer.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: { latitude: 33.8938, longitude: 35.5018 },
			}),
		);
	});
});
