import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	orgUpdate: vi.fn(),
	resolveScope: vi.fn(),
	requireDealer: vi.fn(),
	audit: vi.fn(),
}));

vi.mock("@repo/database", () => ({
	db: { organization: { update: mocks.orgUpdate } },
}));
vi.mock("@repo/auth/lib/audit", () => ({
	dealerAudit: { reminderGrantChanged: mocks.audit },
	getAuditContextFromHeaders: vi.fn(() => ({})),
}));
vi.mock("../lib/scope", () => ({
	resolveDealerScope: mocks.resolveScope,
	requireDealerInScope: mocks.requireDealer,
}));

import {
	setDealerNotificationLimits,
	setDealerReminderGrant,
} from "../procedures/set-reminder-grant";

const operatorScope = {
	organizationId: "abiroot",
	userId: "user-1",
	activeDealerId: "johnnyh",
	isOperator: true,
	canManage: true,
	iradiusDisabled: false,
};

const dealer = {
	id: "dotnet",
	name: "dotnet",
	activeForOrganization: {
		id: "org-elie-mrad",
		name: "Dotnet",
		expiryReminderAllowed: false,
	},
};

async function call(input: Record<string, unknown>) {
	const handler = (
		setDealerReminderGrant as unknown as {
			"~orpc": { handler: (args: unknown) => Promise<unknown> };
		}
	)["~orpc"].handler;
	return handler({
		context: { user: { id: "user-1" }, headers: new Headers() },
		input: { organizationId: "abiroot", dealerId: "dotnet", ...input },
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.resolveScope.mockResolvedValue(operatorScope);
	mocks.requireDealer.mockResolvedValue(dealer);
	mocks.orgUpdate.mockResolvedValue({ id: "org-elie-mrad" });
});

describe("setDealerReminderGrant", () => {
	it("grants and switches the dealer org on", async () => {
		await expect(call({ allowed: true })).resolves.toEqual({
			allowed: true,
			organizationName: "Dotnet",
		});
		expect(mocks.resolveScope).toHaveBeenCalledWith(
			"abiroot",
			"user-1",
			"manage",
		);
		expect(mocks.orgUpdate).toHaveBeenCalledWith({
			where: { id: "org-elie-mrad" },
			data: { expiryReminderAllowed: true, expiryReminderEnabled: true },
			select: { id: true },
		});
		expect(mocks.audit).toHaveBeenCalledOnce();
	});

	it("revokes without touching the dealer's own switch", async () => {
		await call({ allowed: false });
		expect(mocks.orgUpdate.mock.calls[0]?.[0].data).toEqual({
			expiryReminderAllowed: false,
		});
	});

	it("refuses anyone but the operator", async () => {
		mocks.resolveScope.mockResolvedValue({
			...operatorScope,
			isOperator: false,
			canManage: false,
		});
		await expect(call({ allowed: true })).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		expect(mocks.orgUpdate).not.toHaveBeenCalled();
	});

	it("rejects a dealer without a LibanCom org", async () => {
		mocks.requireDealer.mockResolvedValue({
			...dealer,
			activeForOrganization: null,
		});
		await expect(call({ allowed: true })).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "This dealer has no LibanCom account.",
		});
		expect(mocks.orgUpdate).not.toHaveBeenCalled();
		expect(mocks.audit).not.toHaveBeenCalled();
	});
});

describe("setDealerNotificationLimits", () => {
	const limits = {
		stopNoticeSmsLimit: 1,
		stopNoticeWhatsappLimit: 2,
		stopNoticeRate: 0,
		expiryReminderRate: 0,
	};
	function callLimits(input: Record<string, unknown> = {}) {
		const handler = (
			setDealerNotificationLimits as unknown as {
				"~orpc": { handler: (args: unknown) => Promise<unknown> };
			}
		)["~orpc"].handler;
		return handler({
			context: { user: { id: "user-1" }, headers: new Headers() },
			input: {
				organizationId: "abiroot",
				dealerId: "dotnet",
				...limits,
				...input,
			},
		});
	}

	it("stores the limits and rates on the dealer's org", async () => {
		await expect(callLimits()).resolves.toEqual(limits);
		expect(mocks.orgUpdate).toHaveBeenCalledWith({
			where: { id: "org-elie-mrad" },
			data: limits,
			select: { id: true },
		});
		expect(mocks.audit).toHaveBeenCalledOnce();
	});

	it("accepts no limit", async () => {
		await callLimits({ stopNoticeSmsLimit: null });
		expect(mocks.orgUpdate.mock.calls[0]?.[0].data).toMatchObject({
			stopNoticeSmsLimit: null,
		});
	});

	it("refuses anyone but the operator", async () => {
		mocks.resolveScope.mockResolvedValue({
			...operatorScope,
			isOperator: false,
			canManage: false,
		});
		await expect(callLimits()).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		expect(mocks.orgUpdate).not.toHaveBeenCalled();
	});
});
