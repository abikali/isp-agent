import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock database operations
vi.mock("@repo/database", () => ({
	createPurchase: vi.fn(),
	getPurchaseBySubscriptionId: vi.fn(),
	updatePurchase: vi.fn(),
	deletePurchaseBySubscriptionId: vi.fn(),
}));

vi.mock("../../../src/lib/customer", () => ({
	setCustomerIdToEntity: vi.fn(),
}));

vi.mock("@lemonsqueezy/lemonsqueezy.js", () => ({
	lemonSqueezySetup: vi.fn(),
	createCheckout: vi.fn(),
	getCustomer: vi.fn(),
	getSubscription: vi.fn(),
	updateSubscriptionItem: vi.fn(),
	cancelSubscription: vi.fn(),
}));

import {
	createPurchase,
	deletePurchaseBySubscriptionId,
	getPurchaseBySubscriptionId,
	updatePurchase,
} from "@repo/database";
import { setCustomerIdToEntity } from "../../../src/lib/customer";
// Import after mocking
import { webhookHandler } from "../index";

const WEBHOOK_SECRET = "test_webhook_secret_123";

// Helper to create signed request
function createSignedRequest(payload: object): Request {
	const body = JSON.stringify(payload);
	const hmac = createHmac("sha256", WEBHOOK_SECRET);
	const signature = hmac.update(body).digest("hex");

	return {
		text: () => Promise.resolve(body),
		headers: {
			get: (name: string) => (name === "x-signature" ? signature : null),
		},
	} as unknown as Request;
}

// Helper to create request with custom signature
function createRequestWithSignature(
	payload: object,
	signature: string,
): Request {
	const body = JSON.stringify(payload);

	return {
		text: () => Promise.resolve(body),
		headers: {
			get: (name: string) => (name === "x-signature" ? signature : null),
		},
	} as unknown as Request;
}

describe("LemonSqueezy webhookHandler", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		process.env["LEMONSQUEEZY_WEBHOOK_SECRET"] = WEBHOOK_SECRET;
	});

	afterEach(() => {
		delete process.env["LEMONSQUEEZY_WEBHOOK_SECRET"];
	});

	describe("signature validation", () => {
		it("returns 400 for invalid signature", async () => {
			const payload = {
				meta: {
					event_name: "subscription_created",
					custom_data: {},
				},
				data: {
					id: "123",
					attributes: {
						customer_id: "cus_123",
						variant_id: "var_123",
						status: "active",
					},
				},
			};

			// Use a 64-character hex string (proper SHA256 length) that doesn't match
			const wrongSignature = "0".repeat(64);
			const req = createRequestWithSignature(payload, wrongSignature);
			const response = await webhookHandler(req);

			expect(response.status).toBe(400);
			expect(await response.text()).toBe("Invalid signature.");
		});

		it("accepts valid signature", async () => {
			const payload = {
				meta: {
					event_name: "subscription_created",
					custom_data: { organization_id: "org_123" },
				},
				data: {
					id: "123",
					attributes: {
						customer_id: "cus_123",
						variant_id: "var_456",
						status: "active",
					},
				},
			};

			const req = createSignedRequest(payload);
			const response = await webhookHandler(req);

			expect(response.status).toBe(204);
		});

		it("uses timing-safe comparison for signatures", async () => {
			// This test ensures that different-length signatures don't throw
			const payload = {
				meta: { event_name: "test", custom_data: {} },
				data: { id: "1", attributes: {} },
			};

			const req = createRequestWithSignature(payload, "short");
			const response = await webhookHandler(req);

			// Should return 400, not throw
			expect(response.status).toBe(400);
		});
	});

	describe("subscription_created", () => {
		it("creates subscription purchase with organization", async () => {
			const payload = {
				meta: {
					event_name: "subscription_created",
					custom_data: { organization_id: "org_123" },
				},
				data: {
					id: "sub_456",
					attributes: {
						customer_id: "cus_789",
						variant_id: "var_abc",
						status: "active",
					},
				},
			};

			const req = createSignedRequest(payload);
			const response = await webhookHandler(req);

			expect(response.status).toBe(204);
			expect(createPurchase).toHaveBeenCalledWith({
				organizationId: "org_123",
				userId: null,
				subscriptionId: "sub_456",
				customerId: "cus_789",
				productId: "var_abc",
				status: "active",
				type: "SUBSCRIPTION",
			});
			expect(setCustomerIdToEntity).toHaveBeenCalledWith("cus_789", {
				organizationId: "org_123",
			});
		});

		it("creates subscription purchase with user", async () => {
			const payload = {
				meta: {
					event_name: "subscription_created",
					custom_data: { user_id: "user_123" },
				},
				data: {
					id: "sub_456",
					attributes: {
						customer_id: "cus_789",
						variant_id: "var_abc",
						status: "trialing",
					},
				},
			};

			const req = createSignedRequest(payload);
			const response = await webhookHandler(req);

			expect(response.status).toBe(204);
			expect(createPurchase).toHaveBeenCalledWith({
				organizationId: null,
				userId: "user_123",
				subscriptionId: "sub_456",
				customerId: "cus_789",
				productId: "var_abc",
				status: "trialing",
				type: "SUBSCRIPTION",
			});
			expect(setCustomerIdToEntity).toHaveBeenCalledWith("cus_789", {
				userId: "user_123",
			});
		});
	});

	describe("subscription_updated", () => {
		it("updates existing subscription status", async () => {
			vi.mocked(getPurchaseBySubscriptionId).mockResolvedValue({
				id: "purchase_123",
				organizationId: "org_123",
				userId: null,
				subscriptionId: "sub_456",
				customerId: "cus_789",
				productId: "var_abc",
				status: "active",
				type: "SUBSCRIPTION",
			} as any);

			const payload = {
				meta: {
					event_name: "subscription_updated",
					custom_data: {},
				},
				data: {
					id: "sub_456",
					attributes: {
						customer_id: "cus_789",
						variant_id: "var_abc",
						status: "past_due",
					},
				},
			};

			const req = createSignedRequest(payload);
			const response = await webhookHandler(req);

			expect(response.status).toBe(204);
			expect(updatePurchase).toHaveBeenCalledWith({
				id: "purchase_123",
				status: "past_due",
			});
		});

		it("does nothing when subscription not found", async () => {
			vi.mocked(getPurchaseBySubscriptionId).mockResolvedValue(null);

			const payload = {
				meta: {
					event_name: "subscription_updated",
					custom_data: {},
				},
				data: {
					id: "sub_nonexistent",
					attributes: {
						customer_id: "cus_789",
						variant_id: "var_abc",
						status: "past_due",
					},
				},
			};

			const req = createSignedRequest(payload);
			const response = await webhookHandler(req);

			expect(response.status).toBe(204);
			expect(updatePurchase).not.toHaveBeenCalled();
		});
	});

	describe("subscription_cancelled", () => {
		it("updates status to cancelled", async () => {
			vi.mocked(getPurchaseBySubscriptionId).mockResolvedValue({
				id: "purchase_123",
				organizationId: "org_123",
				userId: null,
				subscriptionId: "sub_456",
				customerId: "cus_789",
				productId: "var_abc",
				status: "active",
				type: "SUBSCRIPTION",
			} as any);

			const payload = {
				meta: {
					event_name: "subscription_cancelled",
					custom_data: {},
				},
				data: {
					id: "sub_456",
					attributes: {
						customer_id: "cus_789",
						variant_id: "var_abc",
						status: "cancelled",
					},
				},
			};

			const req = createSignedRequest(payload);
			const response = await webhookHandler(req);

			expect(response.status).toBe(204);
			expect(updatePurchase).toHaveBeenCalledWith({
				id: "purchase_123",
				status: "cancelled",
			});
		});
	});

	describe("subscription_resumed", () => {
		it("updates status when subscription is resumed", async () => {
			vi.mocked(getPurchaseBySubscriptionId).mockResolvedValue({
				id: "purchase_123",
				organizationId: "org_123",
				userId: null,
				subscriptionId: "sub_456",
				customerId: "cus_789",
				productId: "var_abc",
				status: "cancelled",
				type: "SUBSCRIPTION",
			} as any);

			const payload = {
				meta: {
					event_name: "subscription_resumed",
					custom_data: {},
				},
				data: {
					id: "sub_456",
					attributes: {
						customer_id: "cus_789",
						variant_id: "var_abc",
						status: "active",
					},
				},
			};

			const req = createSignedRequest(payload);
			const response = await webhookHandler(req);

			expect(response.status).toBe(204);
			expect(updatePurchase).toHaveBeenCalledWith({
				id: "purchase_123",
				status: "active",
			});
		});
	});

	describe("subscription_expired", () => {
		it("deletes purchase when subscription expires", async () => {
			const payload = {
				meta: {
					event_name: "subscription_expired",
					custom_data: {},
				},
				data: {
					id: "sub_456",
					attributes: {
						customer_id: "cus_789",
						variant_id: "var_abc",
						status: "expired",
					},
				},
			};

			const req = createSignedRequest(payload);
			const response = await webhookHandler(req);

			expect(response.status).toBe(204);
			expect(deletePurchaseBySubscriptionId).toHaveBeenCalledWith(
				"sub_456",
			);
		});
	});

	describe("order_created", () => {
		it("creates one-time purchase with organization", async () => {
			const payload = {
				meta: {
					event_name: "order_created",
					custom_data: { organization_id: "org_123" },
				},
				data: {
					id: "order_456",
					attributes: {
						customer_id: "cus_789",
						product_id: "prod_abc",
						variant_id: "var_xyz",
						status: "paid",
					},
				},
			};

			const req = createSignedRequest(payload);
			const response = await webhookHandler(req);

			expect(response.status).toBe(204);
			expect(createPurchase).toHaveBeenCalledWith({
				organizationId: "org_123",
				userId: null,
				customerId: "cus_789",
				productId: "prod_abc",
				type: "ONE_TIME",
			});
			expect(setCustomerIdToEntity).toHaveBeenCalledWith("cus_789", {
				organizationId: "org_123",
			});
		});

		it("creates one-time purchase with user", async () => {
			const payload = {
				meta: {
					event_name: "order_created",
					custom_data: { user_id: "user_123" },
				},
				data: {
					id: "order_456",
					attributes: {
						customer_id: "cus_789",
						product_id: "prod_abc",
						variant_id: "var_xyz",
						status: "paid",
					},
				},
			};

			const req = createSignedRequest(payload);
			const response = await webhookHandler(req);

			expect(response.status).toBe(204);
			expect(setCustomerIdToEntity).toHaveBeenCalledWith("cus_789", {
				userId: "user_123",
			});
		});
	});

	describe("unhandled events", () => {
		it("returns 200 for unhandled event types", async () => {
			const payload = {
				meta: {
					event_name: "license_key_created",
					custom_data: {},
				},
				data: {
					id: "123",
					attributes: {},
				},
			};

			const req = createSignedRequest(payload);
			const response = await webhookHandler(req);

			expect(response.status).toBe(200);
			expect(await response.text()).toBe("Unhandled event type.");
		});
	});

	describe("error handling", () => {
		it("returns 400 when processing throws an error", async () => {
			vi.mocked(createPurchase).mockRejectedValue(
				new Error("Database connection failed"),
			);

			const payload = {
				meta: {
					event_name: "subscription_created",
					custom_data: { organization_id: "org_123" },
				},
				data: {
					id: "sub_456",
					attributes: {
						customer_id: "cus_789",
						variant_id: "var_abc",
						status: "active",
					},
				},
			};

			const req = createSignedRequest(payload);
			const response = await webhookHandler(req);

			expect(response.status).toBe(400);
			expect(await response.text()).toBe(
				"Webhook error: Database connection failed",
			);
		});

		it("returns 400 for invalid JSON payload", async () => {
			const invalidBody = "not json";
			const hmac = createHmac("sha256", WEBHOOK_SECRET);
			const signature = hmac.update(invalidBody).digest("hex");

			const req = {
				text: () => Promise.resolve(invalidBody),
				headers: {
					get: (name: string) =>
						name === "x-signature" ? signature : null,
				},
			} as unknown as Request;

			const response = await webhookHandler(req);

			expect(response.status).toBe(400);
		});
	});
});
