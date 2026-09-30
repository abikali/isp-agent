import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMany, updateMany } = vi.hoisted(() => ({
	findMany: vi.fn(),
	updateMany: vi.fn(),
}));

vi.mock("@repo/database", () => ({
	db: {
		customer: { findMany },
		aiConversation: { updateMany },
	},
}));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { linkConversationCustomer } from "./link-conversation-customer";

const base = {
	organizationId: "org-1",
	conversationId: "conv-1",
	contactPhone: "96171341878",
	userName: "mohamadshaabanhome",
};

beforeEach(() => {
	findMany.mockReset();
	updateMany.mockReset().mockResolvedValue({ count: 1 });
});

describe("linkConversationCustomer", () => {
	it("links when the ISP lookup was by the contact's phone", async () => {
		findMany.mockResolvedValue([
			{ id: "c-home", status: "ACTIVE", mobile: null, phones: [] },
		]);

		const id = await linkConversationCustomer({
			...base,
			phoneBacked: true,
		});

		expect(id).toBe("c-home");
		expect(findMany.mock.calls[0]?.[0].where).toEqual({
			organizationId: "org-1",
			username: "mohamadshaabanhome",
			deletedAt: null,
		});
		expect(updateMany).toHaveBeenCalledWith({
			where: {
				id: "conv-1",
				OR: [
					{ verifiedCustomerId: null },
					{ verifiedCustomerId: { not: "c-home" } },
				],
			},
			data: { verifiedCustomerId: "c-home" },
		});
	});

	it("links a username pick when the local customer lists the phone", async () => {
		findMany.mockResolvedValue([
			{
				id: "c-home",
				status: "ACTIVE",
				mobile: null,
				phones: [{ number: "+96171341878", primary: true }],
			},
		]);

		expect(
			await linkConversationCustomer({ ...base, phoneBacked: false }),
		).toBe("c-home");
		expect(updateMany).toHaveBeenCalled();
	});

	it("never links on a username alone", async () => {
		findMany.mockResolvedValue([
			{
				id: "c-other",
				status: "ACTIVE",
				mobile: "+96103999999",
				phones: [{ number: "+96103999999", primary: true }],
			},
		]);

		expect(
			await linkConversationCustomer({ ...base, phoneBacked: false }),
		).toBeNull();
		expect(updateMany).not.toHaveBeenCalled();
	});

	it("switches accounts and prefers the ACTIVE duplicate", async () => {
		findMany.mockResolvedValue([
			{ id: "c-stopped", status: "STOPPED", mobile: null, phones: [] },
			{ id: "c-work", status: "ACTIVE", mobile: null, phones: [] },
		]);

		expect(
			await linkConversationCustomer({
				...base,
				userName: "mohamadshaabanwork1",
				phoneBacked: true,
			}),
		).toBe("c-work");
		expect(updateMany.mock.calls[0]?.[0].data).toEqual({
			verifiedCustomerId: "c-work",
		});
	});

	it("does nothing when no local customer has the username", async () => {
		findMany.mockResolvedValue([]);
		expect(
			await linkConversationCustomer({ ...base, phoneBacked: true }),
		).toBeNull();
		expect(updateMany).not.toHaveBeenCalled();
	});
});
