import { ORPCError } from "@orpc/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the database module
vi.mock("@repo/database", () => ({
	db: {
		webhook: {
			create: vi.fn(),
			findMany: vi.fn(),
			findUnique: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
		},
		webhookDelivery: {
			findMany: vi.fn(),
			findUnique: vi.fn(),
		},
		auditLog: {
			create: vi.fn(),
		},
	},
	getOrganizationById: vi.fn(),
}));

// Mock the membership verification
vi.mock("@repo/api/lib/membership", () => ({
	verifyOrganizationMembership: vi.fn(),
}));

// Mock permission functions
vi.mock("@repo/api/lib/permission", () => ({
	getPermissionContext: vi.fn((userId, orgId, role) => ({
		userId,
		organizationId: orgId,
		memberRole: role,
	})),
	verifyPermission: vi.fn(),
}));

// Mock the webhooks package
vi.mock("@repo/webhooks", () => ({
	generateWebhookSecret: vi.fn(() => "whsec_mocksecret"),
	WEBHOOK_EVENTS: {
		"user.created": "user.created",
		"user.updated": "user.updated",
		"organization.updated": "organization.updated",
	},
	dispatchWebhooks: vi.fn(),
	retryWebhookDelivery: vi.fn(),
}));

import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { verifyPermission } from "@repo/api/lib/permission";
import { db, getOrganizationById } from "@repo/database";
import { dispatchWebhooks, retryWebhookDelivery } from "@repo/webhooks";

const mockDb = vi.mocked(db);
const mockGetOrganizationById = vi.mocked(getOrganizationById);
const mockVerifyMembership = vi.mocked(verifyOrganizationMembership);
const mockVerifyPermission = vi.mocked(verifyPermission);
const mockDispatchWebhooks = vi.mocked(dispatchWebhooks);
const mockRetryWebhookDelivery = vi.mocked(retryWebhookDelivery);

// Import handlers after mocking
import { createWebhook } from "../procedures/create";
import { deleteWebhook } from "../procedures/delete";
import { listDeliveries } from "../procedures/deliveries";
import { listWebhooks } from "../procedures/list";
import { retryDelivery } from "../procedures/retry";
import { testWebhook } from "../procedures/test";
import { updateWebhook } from "../procedures/update";

describe("Webhook Procedures", () => {
	const mockUser = { id: "user-123", email: "test@example.com" };
	const mockOrganization = {
		id: "org-456",
		name: "Test Org",
		slug: "test-org",
	};
	const mockContext = { user: mockUser, headers: new Headers() };

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe("createWebhook", () => {
		const validInput = {
			organizationId: "org-456",
			url: "https://example.com/webhook",
			events: ["user.created", "user.updated"],
		};

		it("creates a webhook when user is admin", async () => {
			mockGetOrganizationById.mockResolvedValue(mockOrganization as any);
			mockVerifyMembership.mockResolvedValue({
				organization: mockOrganization,
				role: "admin",
			});
			mockVerifyPermission.mockImplementation(() => undefined); // Allow
			mockDb.webhook.create.mockResolvedValue({
				id: "webhook-789",
				url: validInput.url,
				events: validInput.events,
				enabled: true,
				createdAt: new Date(),
			} as any);

			const handler = createWebhook["~orpc"].handler;
			const result = await handler({
				context: mockContext,
				input: validInput,
			} as any);

			expect(result).toHaveProperty("id", "webhook-789");
			expect(result).toHaveProperty("secret", "whsec_mocksecret");
			expect(mockDb.webhook.create).toHaveBeenCalledWith({
				data: expect.objectContaining({
					organizationId: validInput.organizationId,
					url: validInput.url,
					events: validInput.events,
					secret: "whsec_mocksecret",
					enabled: true,
				}),
				select: expect.any(Object),
			});
		});

		it("creates a webhook when user is owner", async () => {
			mockGetOrganizationById.mockResolvedValue(mockOrganization as any);
			mockVerifyMembership.mockResolvedValue({
				organization: mockOrganization,
				role: "owner",
			});
			mockVerifyPermission.mockImplementation(() => undefined); // Allow
			mockDb.webhook.create.mockResolvedValue({
				id: "webhook-789",
				url: validInput.url,
				events: validInput.events,
				enabled: true,
				createdAt: new Date(),
			} as any);

			const handler = createWebhook["~orpc"].handler;
			const result = await handler({
				context: mockContext,
				input: validInput,
			} as any);

			expect(result).toHaveProperty("id");
			expect(mockDb.webhook.create).toHaveBeenCalled();
		});

		it("throws FORBIDDEN when user is a member but not admin/owner", async () => {
			mockGetOrganizationById.mockResolvedValue(mockOrganization as any);
			mockVerifyMembership.mockResolvedValue({
				organization: mockOrganization,
				role: "member",
			});
			// Mock permission check to throw FORBIDDEN for members
			mockVerifyPermission.mockImplementation(() => {
				throw new ORPCError("FORBIDDEN", {
					message:
						"You don't have permission to create this webhooks",
				});
			});

			const handler = createWebhook["~orpc"].handler;

			await expect(
				handler({ context: mockContext, input: validInput } as any),
			).rejects.toThrow(
				"You don't have permission to create this webhooks",
			);
		});

		it("throws FORBIDDEN when user is not a member", async () => {
			mockGetOrganizationById.mockResolvedValue(mockOrganization as any);
			mockVerifyMembership.mockResolvedValue(null);

			const handler = createWebhook["~orpc"].handler;

			await expect(
				handler({ context: mockContext, input: validInput } as any),
			).rejects.toThrow("You must be a member of this organization");
		});

		it("throws BAD_REQUEST when organization does not exist", async () => {
			mockGetOrganizationById.mockResolvedValue(null);

			const handler = createWebhook["~orpc"].handler;

			await expect(
				handler({ context: mockContext, input: validInput } as any),
			).rejects.toThrow("Organization not found");
		});
	});

	describe("listWebhooks", () => {
		const validInput = { organizationId: "org-456" };

		it("returns webhooks for organization members", async () => {
			mockGetOrganizationById.mockResolvedValue(mockOrganization as any);
			mockVerifyMembership.mockResolvedValue({
				organization: mockOrganization,
				role: "member",
			});
			mockDb.webhook.findMany.mockResolvedValue([
				{
					id: "webhook-1",
					url: "https://example.com/hook1",
					events: ["user.created"],
					enabled: true,
					createdAt: new Date(),
					updatedAt: new Date(),
					_count: { deliveries: 5 },
				},
			] as any);

			const handler = listWebhooks["~orpc"].handler;
			const result = await handler({
				context: mockContext,
				input: validInput,
			} as any);

			expect(result.webhooks).toHaveLength(1);
			expect(result.webhooks[0]).toHaveProperty("id", "webhook-1");
		});

		it("throws FORBIDDEN when user is not a member", async () => {
			mockGetOrganizationById.mockResolvedValue(mockOrganization as any);
			mockVerifyMembership.mockResolvedValue(null);

			const handler = listWebhooks["~orpc"].handler;

			await expect(
				handler({ context: mockContext, input: validInput } as any),
			).rejects.toThrow("You must be a member of this organization");
		});

		it("orders webhooks by creation date descending", async () => {
			mockGetOrganizationById.mockResolvedValue(mockOrganization as any);
			mockVerifyMembership.mockResolvedValue({
				organization: mockOrganization,
				role: "member",
			});
			mockDb.webhook.findMany.mockResolvedValue([]);

			const handler = listWebhooks["~orpc"].handler;
			await handler({ context: mockContext, input: validInput } as any);

			expect(mockDb.webhook.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					orderBy: { createdAt: "desc" },
				}),
			);
		});
	});

	describe("updateWebhook", () => {
		const webhookId = "webhook-789";

		it("updates webhook when user is admin", async () => {
			mockDb.webhook.findUnique.mockResolvedValue({
				id: webhookId,
				organizationId: "org-456",
			} as any);
			mockVerifyMembership.mockResolvedValue({
				organization: mockOrganization,
				role: "admin",
			});
			mockVerifyPermission.mockImplementation(() => undefined); // Allow
			mockDb.webhook.update.mockResolvedValue({
				id: webhookId,
				url: "https://new-url.com/webhook",
				events: ["user.created"],
				enabled: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			} as any);

			const handler = updateWebhook["~orpc"].handler;
			const result = await handler({
				context: mockContext,
				input: {
					id: webhookId,
					url: "https://new-url.com/webhook",
					enabled: false,
				},
			} as any);

			expect(result).toHaveProperty("id", webhookId);
			expect(mockDb.webhook.update).toHaveBeenCalledWith({
				where: { id: webhookId },
				data: expect.objectContaining({
					url: "https://new-url.com/webhook",
					enabled: false,
				}),
				select: expect.any(Object),
			});
		});

		it("throws NOT_FOUND when webhook does not exist", async () => {
			mockDb.webhook.findUnique.mockResolvedValue(null);

			const handler = updateWebhook["~orpc"].handler;

			await expect(
				handler({
					context: mockContext,
					input: { id: webhookId, enabled: false },
				} as any),
			).rejects.toThrow("Webhook not found");
		});

		it("throws FORBIDDEN when user is not admin/owner", async () => {
			mockDb.webhook.findUnique.mockResolvedValue({
				id: webhookId,
				organizationId: "org-456",
			} as any);
			mockVerifyMembership.mockResolvedValue({
				organization: mockOrganization,
				role: "member",
			});
			// Mock permission check to throw FORBIDDEN for members
			mockVerifyPermission.mockImplementation(() => {
				throw new ORPCError("FORBIDDEN", {
					message:
						"You don't have permission to update this webhooks",
				});
			});

			const handler = updateWebhook["~orpc"].handler;

			await expect(
				handler({
					context: mockContext,
					input: { id: webhookId, enabled: false },
				} as any),
			).rejects.toThrow(
				"You don't have permission to update this webhooks",
			);
		});

		it("only updates provided fields", async () => {
			mockDb.webhook.findUnique.mockResolvedValue({
				id: webhookId,
				organizationId: "org-456",
			} as any);
			mockVerifyMembership.mockResolvedValue({
				organization: mockOrganization,
				role: "owner",
			});
			mockVerifyPermission.mockImplementation(() => undefined); // Allow
			mockDb.webhook.update.mockResolvedValue({} as any);

			const handler = updateWebhook["~orpc"].handler;
			await handler({
				context: mockContext,
				input: { id: webhookId, enabled: true },
			} as any);

			// Should only include enabled, not url or events
			expect(mockDb.webhook.update).toHaveBeenCalledWith({
				where: { id: webhookId },
				data: { enabled: true },
				select: expect.any(Object),
			});
		});
	});

	describe("deleteWebhook", () => {
		const webhookId = "webhook-789";

		it("deletes webhook when user is admin", async () => {
			mockDb.webhook.findUnique.mockResolvedValue({
				id: webhookId,
				organizationId: "org-456",
			} as any);
			mockVerifyMembership.mockResolvedValue({
				organization: mockOrganization,
				role: "admin",
			});
			mockVerifyPermission.mockImplementation(() => undefined); // Allow
			mockDb.webhook.delete.mockResolvedValue({} as any);

			const handler = deleteWebhook["~orpc"].handler;
			const result = await handler({
				context: mockContext,
				input: { id: webhookId },
			} as any);

			expect(result).toEqual({ success: true });
			expect(mockDb.webhook.delete).toHaveBeenCalledWith({
				where: { id: webhookId },
			});
		});

		it("throws NOT_FOUND when webhook does not exist", async () => {
			mockDb.webhook.findUnique.mockResolvedValue(null);

			const handler = deleteWebhook["~orpc"].handler;

			await expect(
				handler({
					context: mockContext,
					input: { id: webhookId },
				} as any),
			).rejects.toThrow("Webhook not found");
		});

		it("throws FORBIDDEN when user is not admin/owner", async () => {
			mockDb.webhook.findUnique.mockResolvedValue({
				id: webhookId,
				organizationId: "org-456",
			} as any);
			mockVerifyMembership.mockResolvedValue({
				organization: mockOrganization,
				role: "member",
			});
			// Mock permission check to throw FORBIDDEN for members
			mockVerifyPermission.mockImplementation(() => {
				throw new ORPCError("FORBIDDEN", {
					message:
						"You don't have permission to delete this webhooks",
				});
			});

			const handler = deleteWebhook["~orpc"].handler;

			await expect(
				handler({
					context: mockContext,
					input: { id: webhookId },
				} as any),
			).rejects.toThrow(
				"You don't have permission to delete this webhooks",
			);
		});
	});

	describe("testWebhook", () => {
		const webhookId = "webhook-789";

		it("sends test webhook when user is admin", async () => {
			mockDb.webhook.findUnique.mockResolvedValue({
				id: webhookId,
				organizationId: "org-456",
				events: ["user.created", "user.updated"],
			} as any);
			mockVerifyMembership.mockResolvedValue({
				organization: mockOrganization,
				role: "admin",
			});
			mockVerifyPermission.mockImplementation(() => undefined); // Allow
			mockDispatchWebhooks.mockResolvedValue([
				{
					webhookId,
					success: true,
					statusCode: 200,
				},
			]);

			const handler = testWebhook["~orpc"].handler;
			const result = await handler({
				context: mockContext,
				input: { id: webhookId },
			} as any);

			expect(result).toEqual({
				success: true,
				statusCode: 200,
				error: undefined,
			});
			expect(mockDispatchWebhooks).toHaveBeenCalledWith({
				organizationId: "org-456",
				event: "user.created", // First event in the list
				data: expect.objectContaining({
					test: true,
					message: "This is a test webhook",
				}),
			});
		});

		it("uses organization.updated when no events are configured", async () => {
			mockDb.webhook.findUnique.mockResolvedValue({
				id: webhookId,
				organizationId: "org-456",
				events: [],
			} as any);
			mockVerifyMembership.mockResolvedValue({
				organization: mockOrganization,
				role: "owner",
			});
			mockVerifyPermission.mockImplementation(() => undefined); // Allow
			mockDispatchWebhooks.mockResolvedValue([]);

			const handler = testWebhook["~orpc"].handler;
			await handler({
				context: mockContext,
				input: { id: webhookId },
			} as any);

			expect(mockDispatchWebhooks).toHaveBeenCalledWith(
				expect.objectContaining({
					event: "organization.updated",
				}),
			);
		});

		it("returns error when test fails", async () => {
			mockDb.webhook.findUnique.mockResolvedValue({
				id: webhookId,
				organizationId: "org-456",
				events: ["user.created"],
			} as any);
			mockVerifyMembership.mockResolvedValue({
				organization: mockOrganization,
				role: "admin",
			});
			mockVerifyPermission.mockImplementation(() => undefined); // Allow
			mockDispatchWebhooks.mockResolvedValue([
				{
					webhookId,
					success: false,
					statusCode: 500,
					error: "Internal Server Error",
				},
			]);

			const handler = testWebhook["~orpc"].handler;
			const result = await handler({
				context: mockContext,
				input: { id: webhookId },
			} as any);

			expect(result).toEqual({
				success: false,
				statusCode: 500,
				error: "Internal Server Error",
			});
		});

		it("throws FORBIDDEN when user is not admin/owner", async () => {
			mockDb.webhook.findUnique.mockResolvedValue({
				id: webhookId,
				organizationId: "org-456",
				events: ["user.created"],
			} as any);
			mockVerifyMembership.mockResolvedValue({
				organization: mockOrganization,
				role: "member",
			});
			// Mock permission check to throw FORBIDDEN for members
			mockVerifyPermission.mockImplementation(() => {
				throw new ORPCError("FORBIDDEN", {
					message:
						"You don't have permission to update this webhooks",
				});
			});

			const handler = testWebhook["~orpc"].handler;

			await expect(
				handler({
					context: mockContext,
					input: { id: webhookId },
				} as any),
			).rejects.toThrow(
				"You don't have permission to update this webhooks",
			);
		});
	});

	describe("listDeliveries", () => {
		const webhookId = "webhook-789";

		it("returns deliveries for organization members", async () => {
			mockDb.webhook.findUnique.mockResolvedValue({
				id: webhookId,
				organizationId: "org-456",
			} as any);
			mockVerifyMembership.mockResolvedValue({
				organization: mockOrganization,
				role: "member",
			});
			mockDb.webhookDelivery.findMany.mockResolvedValue([
				{
					id: "delivery-1",
					event: "user.created",
					statusCode: 200,
					attempts: 1,
					deliveredAt: new Date(),
					createdAt: new Date(),
				},
			] as any);

			const handler = listDeliveries["~orpc"].handler;
			const result = await handler({
				context: mockContext,
				input: { webhookId, limit: 20 },
			} as any);

			expect(result.deliveries).toHaveLength(1);
			expect(result.deliveries[0]).toHaveProperty("id", "delivery-1");
		});

		it("supports pagination with cursor", async () => {
			mockDb.webhook.findUnique.mockResolvedValue({
				id: webhookId,
				organizationId: "org-456",
			} as any);
			mockVerifyMembership.mockResolvedValue({
				organization: mockOrganization,
				role: "member",
			});
			mockDb.webhookDelivery.findMany.mockResolvedValue([]);

			const handler = listDeliveries["~orpc"].handler;
			await handler({
				context: mockContext,
				input: { webhookId, limit: 20, cursor: "cursor-123" },
			} as any);

			expect(mockDb.webhookDelivery.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					cursor: { id: "cursor-123" },
					skip: 1,
				}),
			);
		});

		it("returns nextCursor when more items exist", async () => {
			mockDb.webhook.findUnique.mockResolvedValue({
				id: webhookId,
				organizationId: "org-456",
			} as any);
			mockVerifyMembership.mockResolvedValue({
				organization: mockOrganization,
				role: "member",
			});
			// Return limit + 1 items to indicate more pages
			mockDb.webhookDelivery.findMany.mockResolvedValue([
				{ id: "delivery-1" },
				{ id: "delivery-2" },
				{ id: "delivery-3" },
			] as any);

			const handler = listDeliveries["~orpc"].handler;
			const result = await handler({
				context: mockContext,
				input: { webhookId, limit: 2 },
			} as any);

			expect(result.deliveries).toHaveLength(2);
			expect(result.nextCursor).toBe("delivery-3");
		});

		it("throws FORBIDDEN when user is not a member", async () => {
			mockDb.webhook.findUnique.mockResolvedValue({
				id: webhookId,
				organizationId: "org-456",
			} as any);
			mockVerifyMembership.mockResolvedValue(null);

			const handler = listDeliveries["~orpc"].handler;

			await expect(
				handler({
					context: mockContext,
					input: { webhookId, limit: 20 },
				} as any),
			).rejects.toThrow("You must be a member of this organization");
		});
	});

	describe("retryDelivery", () => {
		const deliveryId = "delivery-123";

		it("retries delivery when user is admin", async () => {
			mockDb.webhookDelivery.findUnique.mockResolvedValue({
				id: deliveryId,
				deliveredAt: null,
				webhook: {
					id: "webhook-789",
					organizationId: "org-456",
				},
			} as any);
			mockVerifyMembership.mockResolvedValue({
				organization: mockOrganization,
				role: "admin",
			});
			mockVerifyPermission.mockImplementation(() => undefined); // Allow
			mockRetryWebhookDelivery.mockResolvedValue({
				webhookId: "webhook-789",
				success: true,
				statusCode: 200,
			});

			const handler = retryDelivery["~orpc"].handler;
			const result = await handler({
				context: mockContext,
				input: { deliveryId },
			} as any);

			expect(result).toEqual({
				webhookId: "webhook-789",
				success: true,
				statusCode: 200,
			});
			expect(mockRetryWebhookDelivery).toHaveBeenCalledWith(deliveryId);
		});

		it("throws BAD_REQUEST when delivery already succeeded", async () => {
			mockDb.webhookDelivery.findUnique.mockResolvedValue({
				id: deliveryId,
				deliveredAt: new Date(), // Already succeeded
				webhook: {
					id: "webhook-789",
					organizationId: "org-456",
				},
			} as any);
			mockVerifyMembership.mockResolvedValue({
				organization: mockOrganization,
				role: "admin",
			});
			mockVerifyPermission.mockImplementation(() => undefined); // Allow

			const handler = retryDelivery["~orpc"].handler;

			await expect(
				handler({
					context: mockContext,
					input: { deliveryId },
				} as any),
			).rejects.toThrow("This delivery already succeeded");
		});

		it("throws NOT_FOUND when delivery does not exist", async () => {
			mockDb.webhookDelivery.findUnique.mockResolvedValue(null);

			const handler = retryDelivery["~orpc"].handler;

			await expect(
				handler({
					context: mockContext,
					input: { deliveryId },
				} as any),
			).rejects.toThrow("Delivery not found");
		});

		it("throws FORBIDDEN when user is not admin/owner", async () => {
			mockDb.webhookDelivery.findUnique.mockResolvedValue({
				id: deliveryId,
				deliveredAt: null,
				webhook: {
					id: "webhook-789",
					organizationId: "org-456",
				},
			} as any);
			mockVerifyMembership.mockResolvedValue({
				organization: mockOrganization,
				role: "member",
			});
			// Mock permission check to throw FORBIDDEN for members
			mockVerifyPermission.mockImplementation(() => {
				throw new ORPCError("FORBIDDEN", {
					message:
						"You don't have permission to update this webhooks",
				});
			});

			const handler = retryDelivery["~orpc"].handler;

			await expect(
				handler({
					context: mockContext,
					input: { deliveryId },
				} as any),
			).rejects.toThrow(
				"You don't have permission to update this webhooks",
			);
		});
	});
});
