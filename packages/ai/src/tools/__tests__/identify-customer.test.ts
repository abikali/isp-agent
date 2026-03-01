import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/database", () => ({
	db: {
		customer: {
			findMany: vi.fn(),
		},
	},
}));

import { db } from "@repo/database";
import { identifyCustomer } from "../identify-customer";
import type { ToolContext } from "../types";

const mockDb = vi.mocked(db);

const baseContext: ToolContext = {
	organizationId: "org-123",
	agentId: "agent-456",
	conversationId: "conv-789",
	externalChatId: "chat-001",
};

function callTool(args: { query: string; queryType: string }) {
	const tool = identifyCustomer.factory(baseContext);
	return tool.execute?.(args);
}

describe("identify-customer tool", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns not found when no customers match", async () => {
		mockDb.customer.findMany.mockResolvedValue([]);

		const result = await callTool({
			query: "+961000000000",
			queryType: "phone",
		});

		expect(result).toEqual({
			found: false,
			message: "No customer found with the provided information.",
		});
		expect(mockDb.customer.findMany).toHaveBeenCalledWith({
			where: { organizationId: "org-123", phone: "+961000000000" },
			select: {
				id: true,
				fullName: true,
				accountNumber: true,
				pinHash: true,
			},
		});
	});

	it("returns single customer when exactly one matches", async () => {
		mockDb.customer.findMany.mockResolvedValue([
			{
				id: "cust-1",
				fullName: "Ahmad Khalil",
				accountNumber: "ACC-10042",
				pinHash: "hashed-pin-123",
			},
		] as any);

		const result = await callTool({
			query: "+96179174574",
			queryType: "phone",
		});

		expect(result).toEqual({
			found: true,
			customerId: "cust-1",
			name: "Ahmad",
			accountNumberLast4: "0042",
			hasPin: true,
		});
	});

	it("returns single customer without PIN when pinHash is null", async () => {
		mockDb.customer.findMany.mockResolvedValue([
			{
				id: "cust-2",
				fullName: "Sara",
				accountNumber: "ACC-99001",
				pinHash: null,
			},
		] as any);

		const result = await callTool({
			query: "sara@example.com",
			queryType: "email",
		});

		expect(result).toEqual({
			found: true,
			customerId: "cust-2",
			name: "Sara",
			accountNumberLast4: "9001",
			hasPin: false,
		});
		expect(mockDb.customer.findMany).toHaveBeenCalledWith({
			where: { organizationId: "org-123", email: "sara@example.com" },
			select: {
				id: true,
				fullName: true,
				accountNumber: true,
				pinHash: true,
			},
		});
	});

	it("returns multiple matches when several customers share the same phone", async () => {
		mockDb.customer.findMany.mockResolvedValue([
			{
				id: "cust-10",
				fullName: "Hassan Nasrallah",
				accountNumber: "ACC-55001",
				pinHash: "hashed-pin-a",
			},
			{
				id: "cust-11",
				fullName: "Rima Nasrallah",
				accountNumber: "ACC-55002",
				pinHash: null,
			},
			{
				id: "cust-12",
				fullName: "Ali Nasrallah",
				accountNumber: "ACC-55003",
				pinHash: "hashed-pin-b",
			},
		] as any);

		const result = await callTool({
			query: "+96179174574",
			queryType: "phone",
		});

		expect(result).toEqual({
			found: true,
			multipleMatches: true,
			message:
				"Multiple customers (3) share this phone. Ask the customer which account is theirs.",
			customers: [
				{
					customerId: "cust-10",
					name: "Hassan",
					accountNumberLast4: "5001",
					hasPin: true,
				},
				{
					customerId: "cust-11",
					name: "Rima",
					accountNumberLast4: "5002",
					hasPin: false,
				},
				{
					customerId: "cust-12",
					name: "Ali",
					accountNumberLast4: "5003",
					hasPin: true,
				},
			],
		});
	});

	it("returns multiple matches for shared email", async () => {
		mockDb.customer.findMany.mockResolvedValue([
			{
				id: "cust-20",
				fullName: "John Smith",
				accountNumber: "ACC-77010",
				pinHash: null,
			},
			{
				id: "cust-21",
				fullName: "Jane Smith",
				accountNumber: "ACC-77020",
				pinHash: "hashed-pin-c",
			},
		] as any);

		const result = await callTool({
			query: "smith@family.com",
			queryType: "email",
		});

		expect(result).toEqual({
			found: true,
			multipleMatches: true,
			message:
				"Multiple customers (2) share this email. Ask the customer which account is theirs.",
			customers: [
				{
					customerId: "cust-20",
					name: "John",
					accountNumberLast4: "7010",
					hasPin: false,
				},
				{
					customerId: "cust-21",
					name: "Jane",
					accountNumberLast4: "7020",
					hasPin: true,
				},
			],
		});
	});

	it("uses account_number query type correctly", async () => {
		mockDb.customer.findMany.mockResolvedValue([
			{
				id: "cust-30",
				fullName: "Omar Haddad",
				accountNumber: "ACC-12345",
				pinHash: "hashed",
			},
		] as any);

		const result = await callTool({
			query: "ACC-12345",
			queryType: "account_number",
		});

		expect(result).toEqual({
			found: true,
			customerId: "cust-30",
			name: "Omar",
			accountNumberLast4: "2345",
			hasPin: true,
		});
		expect(mockDb.customer.findMany).toHaveBeenCalledWith({
			where: {
				organizationId: "org-123",
				accountNumber: "ACC-12345",
			},
			select: {
				id: true,
				fullName: true,
				accountNumber: true,
				pinHash: true,
			},
		});
	});

	it("handles database errors gracefully", async () => {
		mockDb.customer.findMany.mockRejectedValue(
			new Error("Connection refused"),
		);

		const result = await callTool({
			query: "+96100000000",
			queryType: "phone",
		});

		expect(result).toEqual({
			found: false,
			message: "Lookup failed: Connection refused",
		});
	});

	it("scopes queries to the organization from context", async () => {
		const orgContext: ToolContext = {
			...baseContext,
			organizationId: "org-specific-999",
		};
		const tool = identifyCustomer.factory(orgContext);
		mockDb.customer.findMany.mockResolvedValue([]);

		await tool.execute?.({ query: "+961111111", queryType: "phone" });

		expect(mockDb.customer.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					organizationId: "org-specific-999",
				}),
			}),
		);
	});

	it("message references the correct query type for account number", async () => {
		mockDb.customer.findMany.mockResolvedValue([
			{
				id: "c1",
				fullName: "A B",
				accountNumber: "ACC-001",
				pinHash: null,
			},
			{
				id: "c2",
				fullName: "C D",
				accountNumber: "ACC-002",
				pinHash: null,
			},
		] as any);

		const result = await callTool({
			query: "ACC-001",
			queryType: "account_number",
		});

		expect(result).toMatchObject({
			multipleMatches: true,
			message: expect.stringContaining("account number"),
		});
	});
});
