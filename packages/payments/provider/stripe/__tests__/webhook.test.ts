import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock Stripe
const mockConstructEventAsync = vi.fn();
const mockCheckoutSessionsRetrieve = vi.fn();

vi.mock("stripe", () => {
	return {
		default: class MockStripe {
			webhooks = {
				constructEventAsync: mockConstructEventAsync,
			};
			checkout = {
				sessions: {
					retrieve: mockCheckoutSessionsRetrieve,
				},
			};
		},
	};
});

// Import webhookHandler after mocking
import { webhookHandler } from "../index";

// Mock database operations
vi.mock("@repo/database", () => ({
	createPurchase: vi.fn(),
	getPurchaseBySubscriptionId: vi.fn(),
	updatePurchase: vi.fn(),
	deletePurchaseBySubscriptionId: vi.fn(),
}));

vi.mock("@repo/logs", () => ({
	logger: {
		error: vi.fn(),
	},
}));

vi.mock("../../../src/lib/customer", () => ({
	setCustomerIdToEntity: vi.fn(),
}));

// Import after mocking
import {
	createPurchase,
	deletePurchaseBySubscriptionId,
	getPurchaseBySubscriptionId,
	updatePurchase,
} from "@repo/database";
import { setCustomerIdToEntity } from "../../../src/lib/customer";

// Helper to create mock Request
function createMockRequest(body: string, signature: string): Request {
	return {
		body: true,
		text: () => Promise.resolve(body),
		headers: {
			get: (name: string) =>
				name === "stripe-signature" ? signature : null,
		},
	} as unknown as Request;
}

describe("Stripe webhookHandler", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		process.env["STRIPE_SECRET_KEY"] = "sk_test_123";
		process.env["STRIPE_WEBHOOK_SECRET"] = "whsec_test_123";
	});

	afterEach(() => {
		delete process.env["STRIPE_SECRET_KEY"];
		delete process.env["STRIPE_WEBHOOK_SECRET"];
	});

	describe("signature validation", () => {
		it("returns 400 when request body is missing", async () => {
			const req = {
				body: null,
			} as unknown as Request;

			const response = await webhookHandler(req);

			expect(response.status).toBe(400);
			expect(await response.text()).toBe("Invalid request.");
		});

		it("returns 400 when signature validation fails", async () => {
			mockConstructEventAsync.mockRejectedValue(
				new Error("Invalid signature"),
			);

			const req = createMockRequest(
				JSON.stringify({ type: "test" }),
				"invalid_signature",
			);

			const response = await webhookHandler(req);

			expect(response.status).toBe(400);
			expect(await response.text()).toBe("Invalid request.");
		});
	});

	describe("checkout.session.completed", () => {
		it("skips subscription mode checkout", async () => {
			mockConstructEventAsync.mockResolvedValue({
				type: "checkout.session.completed",
				data: {
					object: {
						mode: "subscription",
						metadata: {},
						customer: "cus_123",
						id: "cs_123",
					},
				},
			});

			const req = createMockRequest("{}", "valid_sig");
			const response = await webhookHandler(req);

			expect(response.status).toBe(204);
			expect(createPurchase).not.toHaveBeenCalled();
		});

		it("creates one-time purchase on checkout completion", async () => {
			mockConstructEventAsync.mockResolvedValue({
				type: "checkout.session.completed",
				data: {
					object: {
						mode: "payment",
						metadata: {
							organization_id: "org_123",
							user_id: null,
						},
						customer: "cus_456",
						id: "cs_789",
					},
				},
			});

			mockCheckoutSessionsRetrieve.mockResolvedValue({
				line_items: {
					data: [
						{
							price: { id: "price_abc" },
						},
					],
				},
			});

			const req = createMockRequest("{}", "valid_sig");
			const response = await webhookHandler(req);

			expect(response.status).toBe(204);
			expect(createPurchase).toHaveBeenCalledWith({
				organizationId: "org_123",
				userId: null,
				customerId: "cus_456",
				type: "ONE_TIME",
				productId: "price_abc",
			});
			expect(setCustomerIdToEntity).toHaveBeenCalledWith("cus_456", {
				organizationId: "org_123",
			});
		});

		it("returns 400 when product ID is missing", async () => {
			mockConstructEventAsync.mockResolvedValue({
				type: "checkout.session.completed",
				data: {
					object: {
						mode: "payment",
						metadata: {},
						customer: "cus_123",
						id: "cs_123",
					},
				},
			});

			mockCheckoutSessionsRetrieve.mockResolvedValue({
				line_items: {
					data: [],
				},
			});

			const req = createMockRequest("{}", "valid_sig");
			const response = await webhookHandler(req);

			expect(response.status).toBe(400);
			expect(await response.text()).toBe("Missing product ID.");
		});
	});

	describe("customer.subscription.created", () => {
		it("creates subscription purchase", async () => {
			mockConstructEventAsync.mockResolvedValue({
				type: "customer.subscription.created",
				data: {
					object: {
						id: "sub_123",
						metadata: {
							organization_id: "org_456",
							user_id: null,
						},
						customer: "cus_789",
						items: {
							data: [
								{
									price: { id: "price_xyz" },
								},
							],
						},
						status: "active",
					},
				},
			});

			const req = createMockRequest("{}", "valid_sig");
			const response = await webhookHandler(req);

			expect(response.status).toBe(204);
			expect(createPurchase).toHaveBeenCalledWith({
				subscriptionId: "sub_123",
				organizationId: "org_456",
				userId: null,
				customerId: "cus_789",
				type: "SUBSCRIPTION",
				productId: "price_xyz",
				status: "active",
			});
			expect(setCustomerIdToEntity).toHaveBeenCalledWith("cus_789", {
				organizationId: "org_456",
			});
		});

		it("associates subscription with user when no organization", async () => {
			mockConstructEventAsync.mockResolvedValue({
				type: "customer.subscription.created",
				data: {
					object: {
						id: "sub_123",
						metadata: {
							organization_id: null,
							user_id: "user_456",
						},
						customer: "cus_789",
						items: {
							data: [{ price: { id: "price_abc" } }],
						},
						status: "trialing",
					},
				},
			});

			const req = createMockRequest("{}", "valid_sig");
			await webhookHandler(req);

			expect(setCustomerIdToEntity).toHaveBeenCalledWith("cus_789", {
				userId: "user_456",
			});
		});

		it("returns 400 when product ID is missing", async () => {
			mockConstructEventAsync.mockResolvedValue({
				type: "customer.subscription.created",
				data: {
					object: {
						id: "sub_123",
						metadata: {},
						customer: "cus_789",
						items: { data: [] },
						status: "active",
					},
				},
			});

			const req = createMockRequest("{}", "valid_sig");
			const response = await webhookHandler(req);

			expect(response.status).toBe(400);
			expect(await response.text()).toBe("Missing product ID.");
		});
	});

	describe("customer.subscription.updated", () => {
		it("updates existing subscription status", async () => {
			vi.mocked(getPurchaseBySubscriptionId).mockResolvedValue({
				id: "purchase_123",
				organizationId: "org_123",
				userId: null,
				subscriptionId: "sub_456",
				customerId: "cus_789",
				productId: "price_old",
				status: "active",
				type: "SUBSCRIPTION",
			} as any);

			mockConstructEventAsync.mockResolvedValue({
				type: "customer.subscription.updated",
				data: {
					object: {
						id: "sub_456",
						status: "past_due",
						items: {
							data: [{ price: { id: "price_new" } }],
						},
					},
				},
			});

			const req = createMockRequest("{}", "valid_sig");
			const response = await webhookHandler(req);

			expect(response.status).toBe(204);
			expect(updatePurchase).toHaveBeenCalledWith({
				id: "purchase_123",
				status: "past_due",
				productId: "price_new",
			});
		});

		it("does nothing when subscription not found", async () => {
			vi.mocked(getPurchaseBySubscriptionId).mockResolvedValue(null);

			mockConstructEventAsync.mockResolvedValue({
				type: "customer.subscription.updated",
				data: {
					object: {
						id: "sub_nonexistent",
						status: "canceled",
					},
				},
			});

			const req = createMockRequest("{}", "valid_sig");
			const response = await webhookHandler(req);

			expect(response.status).toBe(204);
			expect(updatePurchase).not.toHaveBeenCalled();
		});
	});

	describe("customer.subscription.deleted", () => {
		it("deletes purchase record on subscription cancellation", async () => {
			mockConstructEventAsync.mockResolvedValue({
				type: "customer.subscription.deleted",
				data: {
					object: {
						id: "sub_to_delete",
					},
				},
			});

			const req = createMockRequest("{}", "valid_sig");
			const response = await webhookHandler(req);

			expect(response.status).toBe(204);
			expect(deletePurchaseBySubscriptionId).toHaveBeenCalledWith(
				"sub_to_delete",
			);
		});
	});

	describe("unhandled events", () => {
		it("returns 200 for unhandled event types", async () => {
			mockConstructEventAsync.mockResolvedValue({
				type: "payment_intent.succeeded",
				data: { object: {} },
			});

			const req = createMockRequest("{}", "valid_sig");
			const response = await webhookHandler(req);

			expect(response.status).toBe(200);
			expect(await response.text()).toBe("Unhandled event type.");
		});
	});

	describe("error handling", () => {
		it("returns 500 for transient errors so Stripe retries", async () => {
			mockConstructEventAsync.mockResolvedValue({
				type: "customer.subscription.created",
				data: {
					object: {
						id: "sub_123",
						metadata: {},
						customer: "cus_789",
						items: { data: [{ price: { id: "price_abc" } }] },
						status: "active",
					},
				},
			});

			vi.mocked(createPurchase).mockRejectedValue(
				new Error("Database error"),
			);

			const req = createMockRequest("{}", "valid_sig");
			const response = await webhookHandler(req);

			expect(response.status).toBe(500);
			expect(await response.text()).toBe("Webhook error: Database error");
		});

		it("returns 400 for permanent failures so Stripe does not retry", async () => {
			mockConstructEventAsync.mockResolvedValue({
				type: "customer.subscription.created",
				data: {
					object: {
						id: "sub_123",
						metadata: {},
						customer: "cus_789",
						items: { data: [{ price: { id: "price_abc" } }] },
						status: "active",
					},
				},
			});

			vi.mocked(createPurchase).mockRejectedValue(
				new Error("Invalid subscription state"),
			);

			const req = createMockRequest("{}", "valid_sig");
			const response = await webhookHandler(req);

			expect(response.status).toBe(400);
			expect(await response.text()).toBe(
				"Webhook error: Invalid subscription state",
			);
		});
	});
});
