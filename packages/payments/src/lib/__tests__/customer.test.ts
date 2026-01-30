import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCustomerIdFromEntity, setCustomerIdToEntity } from "../customer";

// Mock database operations
vi.mock("@repo/database", () => ({
	getOrganizationById: vi.fn(),
	getUserById: vi.fn(),
	updateOrganization: vi.fn(),
	updateUser: vi.fn(),
}));

// Import after mocking
import {
	getOrganizationById,
	getUserById,
	updateOrganization,
	updateUser,
} from "@repo/database";

describe("setCustomerIdToEntity", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("updates organization with customer ID when organizationId is provided", async () => {
		await setCustomerIdToEntity("cus_123", { organizationId: "org_456" });

		expect(updateOrganization).toHaveBeenCalledWith({
			id: "org_456",
			paymentsCustomerId: "cus_123",
		});
		expect(updateUser).not.toHaveBeenCalled();
	});

	it("updates user with customer ID when userId is provided", async () => {
		await setCustomerIdToEntity("cus_123", { userId: "user_456" });

		expect(updateUser).toHaveBeenCalledWith({
			id: "user_456",
			paymentsCustomerId: "cus_123",
		});
		expect(updateOrganization).not.toHaveBeenCalled();
	});

	it("prioritizes organizationId over userId when both are provided", async () => {
		await setCustomerIdToEntity("cus_123", {
			organizationId: "org_456",
			userId: "user_789",
		});

		expect(updateOrganization).toHaveBeenCalledWith({
			id: "org_456",
			paymentsCustomerId: "cus_123",
		});
		expect(updateUser).not.toHaveBeenCalled();
	});

	it("does nothing when neither organizationId nor userId is provided", async () => {
		await setCustomerIdToEntity("cus_123", {});

		expect(updateOrganization).not.toHaveBeenCalled();
		expect(updateUser).not.toHaveBeenCalled();
	});
});

describe("getCustomerIdFromEntity", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns organization customer ID when organizationId is provided", async () => {
		vi.mocked(getOrganizationById).mockResolvedValue({
			id: "org_456",
			name: "Test Org",
			slug: "test-org",
			paymentsCustomerId: "cus_org_123",
			logo: null,
			createdAt: new Date(),
			metadata: null,
		} as any);

		const result = await getCustomerIdFromEntity({
			organizationId: "org_456",
		});

		expect(result).toBe("cus_org_123");
		expect(getOrganizationById).toHaveBeenCalledWith("org_456");
		expect(getUserById).not.toHaveBeenCalled();
	});

	it("returns null when organization has no customer ID", async () => {
		vi.mocked(getOrganizationById).mockResolvedValue({
			id: "org_456",
			name: "Test Org",
			slug: "test-org",
			paymentsCustomerId: null,
			logo: null,
			createdAt: new Date(),
			metadata: null,
		} as any);

		const result = await getCustomerIdFromEntity({
			organizationId: "org_456",
		});

		expect(result).toBeNull();
	});

	it("returns null when organization is not found", async () => {
		vi.mocked(getOrganizationById).mockResolvedValue(null);

		const result = await getCustomerIdFromEntity({
			organizationId: "org_nonexistent",
		});

		expect(result).toBeNull();
	});

	it("returns user customer ID when userId is provided", async () => {
		vi.mocked(getUserById).mockResolvedValue({
			id: "user_456",
			email: "test@example.com",
			name: "Test User",
			paymentsCustomerId: "cus_user_123",
			emailVerified: true,
			image: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		} as any);

		const result = await getCustomerIdFromEntity({ userId: "user_456" });

		expect(result).toBe("cus_user_123");
		expect(getUserById).toHaveBeenCalledWith("user_456");
		expect(getOrganizationById).not.toHaveBeenCalled();
	});

	it("returns null when user has no customer ID", async () => {
		vi.mocked(getUserById).mockResolvedValue({
			id: "user_456",
			email: "test@example.com",
			name: "Test User",
			paymentsCustomerId: null,
			emailVerified: true,
			image: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		} as any);

		const result = await getCustomerIdFromEntity({ userId: "user_456" });

		expect(result).toBeNull();
	});

	it("returns null when user is not found", async () => {
		vi.mocked(getUserById).mockResolvedValue(null);

		const result = await getCustomerIdFromEntity({
			userId: "user_nonexistent",
		});

		expect(result).toBeNull();
	});
});
