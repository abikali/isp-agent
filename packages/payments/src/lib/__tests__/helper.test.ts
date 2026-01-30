import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPurchasesHelper } from "../helper";

// Mock config with plans
vi.mock("@repo/config", () => ({
	config: {
		payments: {
			plans: {
				free: {
					isFree: true,
					name: "Free",
					prices: [],
				},
				pro: {
					isFree: false,
					name: "Pro",
					prices: [
						{ productId: "price_pro_monthly", interval: "month" },
						{ productId: "price_pro_yearly", interval: "year" },
					],
				},
				enterprise: {
					isFree: false,
					name: "Enterprise",
					prices: [
						{
							productId: "price_enterprise_monthly",
							interval: "month",
						},
						{
							productId: "price_enterprise_yearly",
							interval: "year",
						},
					],
				},
				lifetime: {
					isFree: false,
					name: "Lifetime",
					prices: [{ productId: "price_lifetime", type: "one_time" }],
				},
			},
		},
	},
}));

describe("createPurchasesHelper", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("activePlan", () => {
		it("returns free plan when no purchases exist", () => {
			const { activePlan } = createPurchasesHelper([]);

			expect(activePlan).toEqual({
				id: "free",
				status: "active",
			});
		});

		it("returns subscription plan when active subscription exists", () => {
			const purchases = [
				{
					id: "purchase_1",
					organizationId: "org_123",
					userId: null,
					subscriptionId: "sub_123",
					customerId: "cus_123",
					productId: "price_pro_monthly",
					status: "active",
					type: "SUBSCRIPTION" as const,
				},
			];

			const { activePlan } = createPurchasesHelper(purchases);

			expect(activePlan).toEqual({
				id: "pro",
				price: { productId: "price_pro_monthly", interval: "month" },
				status: "active",
				purchaseId: "purchase_1",
			});
		});

		it("returns one-time purchase plan when no subscription exists", () => {
			const purchases = [
				{
					id: "purchase_1",
					organizationId: "org_123",
					userId: null,
					subscriptionId: null,
					customerId: "cus_123",
					productId: "price_lifetime",
					status: null,
					type: "ONE_TIME" as const,
				},
			];

			const { activePlan } = createPurchasesHelper(purchases);

			expect(activePlan).toEqual({
				id: "lifetime",
				price: { productId: "price_lifetime", type: "one_time" },
				status: "active",
				purchaseId: "purchase_1",
			});
		});

		it("prioritizes subscription over one-time purchase", () => {
			const purchases = [
				{
					id: "purchase_1",
					organizationId: "org_123",
					userId: null,
					subscriptionId: null,
					customerId: "cus_123",
					productId: "price_lifetime",
					status: null,
					type: "ONE_TIME" as const,
				},
				{
					id: "purchase_2",
					organizationId: "org_123",
					userId: null,
					subscriptionId: "sub_123",
					customerId: "cus_123",
					productId: "price_enterprise_monthly",
					status: "active",
					type: "SUBSCRIPTION" as const,
				},
			];

			const { activePlan } = createPurchasesHelper(purchases);

			expect(activePlan?.id).toBe("enterprise");
			expect(activePlan?.purchaseId).toBe("purchase_2");
		});

		it("handles trialing subscription status", () => {
			const purchases = [
				{
					id: "purchase_1",
					organizationId: "org_123",
					userId: null,
					subscriptionId: "sub_123",
					customerId: "cus_123",
					productId: "price_pro_yearly",
					status: "trialing",
					type: "SUBSCRIPTION" as const,
				},
			];

			const { activePlan } = createPurchasesHelper(purchases);

			expect(activePlan?.status).toBe("trialing");
		});

		it("handles past_due subscription status", () => {
			const purchases = [
				{
					id: "purchase_1",
					organizationId: "org_123",
					userId: null,
					subscriptionId: "sub_123",
					customerId: "cus_123",
					productId: "price_pro_monthly",
					status: "past_due",
					type: "SUBSCRIPTION" as const,
				},
			];

			const { activePlan } = createPurchasesHelper(purchases);

			expect(activePlan?.status).toBe("past_due");
		});
	});

	describe("hasSubscription", () => {
		it("returns true when user has matching subscription", () => {
			const purchases = [
				{
					id: "purchase_1",
					organizationId: "org_123",
					userId: null,
					subscriptionId: "sub_123",
					customerId: "cus_123",
					productId: "price_pro_monthly",
					status: "active",
					type: "SUBSCRIPTION" as const,
				},
			];

			const { hasSubscription } = createPurchasesHelper(purchases);

			expect(hasSubscription("pro")).toBe(true);
		});

		it("returns false when user has different subscription", () => {
			const purchases = [
				{
					id: "purchase_1",
					organizationId: "org_123",
					userId: null,
					subscriptionId: "sub_123",
					customerId: "cus_123",
					productId: "price_pro_monthly",
					status: "active",
					type: "SUBSCRIPTION" as const,
				},
			];

			const { hasSubscription } = createPurchasesHelper(purchases);

			expect(hasSubscription("enterprise")).toBe(false);
		});

		it("returns true when checking array of plan IDs including active plan", () => {
			const purchases = [
				{
					id: "purchase_1",
					organizationId: "org_123",
					userId: null,
					subscriptionId: "sub_123",
					customerId: "cus_123",
					productId: "price_enterprise_yearly",
					status: "active",
					type: "SUBSCRIPTION" as const,
				},
			];

			const { hasSubscription } = createPurchasesHelper(purchases);

			expect(hasSubscription(["pro", "enterprise"])).toBe(true);
		});

		it("returns false when checking array without active plan", () => {
			const purchases = [
				{
					id: "purchase_1",
					organizationId: "org_123",
					userId: null,
					subscriptionId: "sub_123",
					customerId: "cus_123",
					productId: "price_pro_monthly",
					status: "active",
					type: "SUBSCRIPTION" as const,
				},
			];

			const { hasSubscription } = createPurchasesHelper(purchases);

			expect(hasSubscription(["enterprise", "lifetime"])).toBe(false);
		});

		it("returns false when no purchases", () => {
			const { hasSubscription } = createPurchasesHelper([]);

			expect(hasSubscription("pro")).toBe(false);
		});
	});

	describe("hasPurchase", () => {
		it("returns true when user has purchased the plan", () => {
			const purchases = [
				{
					id: "purchase_1",
					organizationId: "org_123",
					userId: null,
					subscriptionId: null,
					customerId: "cus_123",
					productId: "price_lifetime",
					status: null,
					type: "ONE_TIME" as const,
				},
			];

			const { hasPurchase } = createPurchasesHelper(purchases);

			expect(hasPurchase("lifetime")).toBe(true);
		});

		it("returns false when user has not purchased the plan", () => {
			const purchases = [
				{
					id: "purchase_1",
					organizationId: "org_123",
					userId: null,
					subscriptionId: null,
					customerId: "cus_123",
					productId: "price_lifetime",
					status: null,
					type: "ONE_TIME" as const,
				},
			];

			const { hasPurchase } = createPurchasesHelper(purchases);

			expect(hasPurchase("pro")).toBe(false);
		});

		it("returns true for subscription-based plan purchase", () => {
			const purchases = [
				{
					id: "purchase_1",
					organizationId: "org_123",
					userId: null,
					subscriptionId: "sub_123",
					customerId: "cus_123",
					productId: "price_pro_monthly",
					status: "active",
					type: "SUBSCRIPTION" as const,
				},
			];

			const { hasPurchase } = createPurchasesHelper(purchases);

			expect(hasPurchase("pro")).toBe(true);
		});

		it("returns false when no purchases", () => {
			const { hasPurchase } = createPurchasesHelper([]);

			expect(hasPurchase("pro")).toBe(false);
		});

		it("returns true when any price variant of plan was purchased", () => {
			const purchases = [
				{
					id: "purchase_1",
					organizationId: "org_123",
					userId: null,
					subscriptionId: "sub_123",
					customerId: "cus_123",
					productId: "price_pro_yearly",
					status: "active",
					type: "SUBSCRIPTION" as const,
				},
			];

			const { hasPurchase } = createPurchasesHelper(purchases);

			// Both monthly and yearly variants count
			expect(hasPurchase("pro")).toBe(true);
		});
	});

	describe("edge cases", () => {
		it("handles undefined purchases array", () => {
			const { activePlan, hasSubscription, hasPurchase } =
				createPurchasesHelper(undefined as any);

			expect(activePlan?.id).toBe("free");
			expect(hasSubscription("pro")).toBe(false);
			expect(hasPurchase("pro")).toBe(false);
		});

		it("handles purchase with unknown product ID", () => {
			const purchases = [
				{
					id: "purchase_1",
					organizationId: "org_123",
					userId: null,
					subscriptionId: "sub_123",
					customerId: "cus_123",
					productId: "price_unknown_product",
					status: "active",
					type: "SUBSCRIPTION" as const,
				},
			];

			const { activePlan } = createPurchasesHelper(purchases);

			// Falls back to free plan when product not found
			expect(activePlan?.id).toBe(undefined);
		});
	});
});
