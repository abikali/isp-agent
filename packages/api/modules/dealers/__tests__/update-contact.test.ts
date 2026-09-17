import { ORPCError } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	update: vi.fn(),
	resolveScope: vi.fn(),
	requireDealer: vi.fn(),
	updateName: vi.fn(),
	updatePhones: vi.fn(),
	audit: vi.fn(),
}));

vi.mock("@repo/database", () => ({
	db: { ispDealer: { update: mocks.update } },
}));
vi.mock("@repo/jobs", () => ({}));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@repo/auth/lib/audit", () => ({
	dealerAudit: { contactUpdated: mocks.audit },
	getAuditContextFromHeaders: vi.fn(() => ({})),
}));
vi.mock("../lib/scope", () => ({
	resolveDealerScope: mocks.resolveScope,
	requireDealerInScope: mocks.requireDealer,
}));
vi.mock("../../customers/lib/iradius-api", () => ({
	iradiusUpdateUserName: mocks.updateName,
	iradiusUpdateUserPhones: mocks.updatePhones,
}));

import {
	splitDealerName,
	updateDealerContact,
} from "../procedures/update-contact";

const scope = {
	organizationId: "org-1",
	userId: "user-1",
	activeDealerId: "master",
	isOperator: true,
	canManage: true,
	iradiusDisabled: false,
};

const dealer = {
	id: "dealer-1",
	name: "Unknown",
	username: "hamza",
	companyName: null,
	contactName: null,
	whatsappPhone: null,
	phone: null,
	companyMobile: null,
	companyPhone: null,
	externalId: "812",
	deletedAt: null,
};

async function call(input: Record<string, unknown>) {
	const handler = (
		updateDealerContact as unknown as {
			"~orpc": {
				handler: (args: unknown) => Promise<{
					changed: string[];
					whatsappPhone: string | null;
				}>;
			};
		}
	)["~orpc"].handler;
	return handler({
		context: { user: { id: "user-1" }, headers: new Headers() },
		input: { organizationId: "org-1", dealerId: "dealer-1", ...input },
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.resolveScope.mockResolvedValue(scope);
	mocks.requireDealer.mockResolvedValue(dealer);
	mocks.update.mockResolvedValue({ id: "dealer-1" });
	mocks.updateName.mockResolvedValue({ affectedRows: 1 });
	mocks.updatePhones.mockResolvedValue({ affectedRows: 1 });
});

describe("splitDealerName", () => {
	it("splits at the first space so the sync's join round-trips", () => {
		expect(splitDealerName("khoder samad el hajj")).toEqual({
			firstName: "khoder",
			lastName: "samad el hajj",
		});
		expect(splitDealerName("MATARNET")).toEqual({
			firstName: "MATARNET",
			lastName: "",
		});
	});
});

describe("updateDealerContact", () => {
	it("writes name and phone to iRadius before the local row", async () => {
		const order: string[] = [];
		mocks.updateName.mockImplementation(async () => {
			order.push("remote-name");
			return { affectedRows: 1 };
		});
		mocks.updatePhones.mockImplementation(async () => {
			order.push("remote-phone");
			return { affectedRows: 1 };
		});
		mocks.update.mockImplementation(async () => {
			order.push("local");
			return { id: "dealer-1" };
		});

		const result = await call({
			name: "  Hamza   Zaiter ",
			phone: "70 123 456",
		});

		expect(order).toEqual(["remote-name", "remote-phone", "local"]);
		expect(mocks.updateName).toHaveBeenCalledWith(
			dealer,
			"Hamza",
			"Zaiter",
		);
		expect(mocks.updatePhones).toHaveBeenCalledWith(dealer, "70 123 456");
		expect(mocks.update.mock.calls[0]?.[0].data).toEqual({
			name: "Hamza Zaiter",
			phone: "70 123 456",
		});
		expect(result).toEqual({
			changed: ["name", "phone"],
			whatsappPhone: "+96170123456",
		});
		expect(mocks.audit).toHaveBeenCalledOnce();
	});

	it("saves nothing locally when iRadius refuses", async () => {
		mocks.updateName.mockRejectedValue(new Error("tunnel down"));

		await expect(call({ name: "Hamza" })).rejects.toBeInstanceOf(ORPCError);
		expect(mocks.update).not.toHaveBeenCalled();
		expect(mocks.audit).not.toHaveBeenCalled();
	});

	it("treats a missing iRadius user as an error", async () => {
		mocks.updatePhones.mockResolvedValue({ affectedRows: 0 });

		await expect(call({ phone: "71123456" })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		expect(mocks.update).not.toHaveBeenCalled();
	});

	it("stores contact name and WhatsApp number locally only, as E.164", async () => {
		const result = await call({
			contactName: "Hamza",
			whatsappPhone: "03 123 456",
		});

		expect(mocks.updateName).not.toHaveBeenCalled();
		expect(mocks.updatePhones).not.toHaveBeenCalled();
		expect(mocks.update.mock.calls[0]?.[0].data).toEqual({
			contactName: "Hamza",
			whatsappPhone: "+9613123456",
		});
		expect(result.whatsappPhone).toBe("+9613123456");
	});

	it("rejects an invalid WhatsApp number", async () => {
		await expect(
			call({ whatsappPhone: "791745774" }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mocks.update).not.toHaveBeenCalled();
	});

	it("clears fields with an empty value", async () => {
		mocks.requireDealer.mockResolvedValue({
			...dealer,
			contactName: "Hamza",
			whatsappPhone: "+96171123456",
		});

		const result = await call({ contactName: " ", whatsappPhone: "" });

		expect(mocks.update.mock.calls[0]?.[0].data).toEqual({
			contactName: null,
			whatsappPhone: null,
		});
		expect(result.whatsappPhone).toBeNull();
	});

	it("does nothing when nothing changed", async () => {
		const result = await call({ name: "Unknown", phone: "" });

		expect(result.changed).toEqual([]);
		expect(mocks.update).not.toHaveBeenCalled();
		expect(mocks.audit).not.toHaveBeenCalled();
	});

	it("refuses iRadius fields when iRadius is disabled, but allows local ones", async () => {
		mocks.resolveScope.mockResolvedValue({
			...scope,
			iradiusDisabled: true,
		});

		await expect(call({ name: "Hamza" })).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
		expect(mocks.updateName).not.toHaveBeenCalled();

		await call({ contactName: "Hamza" });
		expect(mocks.update).toHaveBeenCalledOnce();
	});

	it("refuses a dealer that is gone from iRadius", async () => {
		mocks.requireDealer.mockResolvedValue({
			...dealer,
			deletedAt: new Date(),
		});

		await expect(call({ phone: "71123456" })).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
	});

	it("is operator-only", async () => {
		mocks.resolveScope.mockResolvedValue({ ...scope, canManage: false });

		await expect(call({ contactName: "x" })).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		expect(mocks.requireDealer).not.toHaveBeenCalled();
	});
});
