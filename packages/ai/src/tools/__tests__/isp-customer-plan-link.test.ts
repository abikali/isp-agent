/**
 * Tool-level checks for the account facts the ISP tools add: the local plan
 * and price, the access medium, and linking the conversation to the account
 * the lookup resolved.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { ispGet, loadLocalPlan, linkConversationCustomer } = vi.hoisted(() => ({
	ispGet: vi.fn(),
	loadLocalPlan: vi.fn(),
	linkConversationCustomer: vi.fn(),
}));

vi.mock("../lib/isp-api-client", () => ({
	cleanIspLookupQuery: (q: string) => q,
	getIspApiConfigFields: () => [],
	isSearchableQuery: () => true,
	ispGet,
	withIspErrorHandling: (
		_context: unknown,
		_name: string,
		fn: (config: unknown) => Promise<unknown>,
	) => fn({}),
}));
vi.mock("../lib/local-plan", () => ({
	PLAN_FIELD_DESCRIPTION: "plan doc",
	loadLocalPlan,
}));
vi.mock("../../link-conversation-customer", () => ({
	linkConversationCustomer,
}));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { buildDiagnosis, ispDiagnoseCustomer } from "../isp-diagnose-customer";
import { detectAccessMedium, ispSearchCustomer } from "../isp-search-customer";
import type { ToolContext } from "../types";

const PLAN = {
	planName: "johnnyh-UP TO 6M",
	monthlyPriceUsd: 35,
	downloadMbps: 6,
	uploadMbps: 6,
	inCurrentCatalog: false,
};

const JOSEPH = {
	firstName: "Joseph",
	lastName: "Smeha",
	userName: "josephsmeha",
	active: true,
	blocked: false,
	online: true,
	fupMode: "0",
	mikrotikInterface: "(VM-PPPoe4)-vlan2050-zone4-olt1-PON4-greenmarket",
	accountTypeName: "johnnyh-UP TO 6M",
};

function context(phoneMatch: Record<string, unknown> | null): ToolContext {
	return {
		organizationId: "org-1",
		agentId: "agent-1",
		credentials: { provider: "openrouter", apiKey: "k" },
		conversationId: "conv-1",
		externalChatId: "96170161789@s.whatsapp.net",
		contactPhone: "96170161789",
		servicePlanIds: ["plan-6m-new"],
		getVerifiedIspCustomer: async () => phoneMatch,
	};
}

async function run(
	registered: typeof ispDiagnoseCustomer,
	ctx: ToolContext,
	query = "josephsmeha",
) {
	const t = registered.factory(ctx) as unknown as {
		execute: (args: unknown, opts: unknown) => Promise<unknown>;
	};
	return (await t.execute({ query }, {})) as Record<string, unknown>;
}

beforeEach(() => {
	vi.clearAllMocks();
	loadLocalPlan.mockResolvedValue(PLAN);
	linkConversationCustomer.mockResolvedValue("cust-1");
	ispGet.mockImplementation(async (_config: unknown, path: string) => {
		if (path === "/user-info") {
			return JOSEPH;
		}
		if (path === "/mikrotik-user-list") {
			return [];
		}
		return null;
	});
});

describe("isp-diagnose-customer account facts", () => {
	it("returns the local plan and the access medium", async () => {
		const result = await run(ispDiagnoseCustomer, context(JOSEPH));

		expect(result["plan"]).toEqual(PLAN);
		expect(result["accessMedium"]).toBe("fiber (OLT/PON)");
		expect(loadLocalPlan).toHaveBeenCalledWith("org-1", "josephsmeha", [
			"plan-6m-new",
		]);
	});

	it("includes the plan on account-issue results too", async () => {
		const blocked = { ...JOSEPH, blocked: true };
		const result = await run(ispDiagnoseCustomer, context(blocked));

		expect(result["severity"]).toBe("account-issue");
		expect(result["plan"]).toEqual(PLAN);
	});

	it("links the conversation, phone-backed when the lookup used the contact phone", async () => {
		await run(ispDiagnoseCustomer, context(JOSEPH));
		expect(linkConversationCustomer).toHaveBeenCalledWith({
			organizationId: "org-1",
			conversationId: "conv-1",
			contactPhone: "96170161789",
			userName: "josephsmeha",
			phoneBacked: true,
		});

		linkConversationCustomer.mockClear();
		await run(ispDiagnoseCustomer, context(null));
		expect(linkConversationCustomer).toHaveBeenCalledWith(
			expect.objectContaining({ phoneBacked: false }),
		);
	});
});

describe("isp-search-customer account facts", () => {
	it("returns plan and accessMedium and links on a single match", async () => {
		const result = await run(ispSearchCustomer, context(null));

		expect(result["plan"]).toEqual(PLAN);
		expect(result["accessMedium"]).toBe("fiber (OLT/PON)");
		expect(linkConversationCustomer).toHaveBeenCalledWith(
			expect.objectContaining({
				userName: "josephsmeha",
				phoneBacked: false,
			}),
		);
	});

	it("never links on a multi-account result", async () => {
		ispGet.mockImplementation(async () => [
			JOSEPH,
			{ ...JOSEPH, userName: "josephsmeha2" },
		]);

		await run(ispSearchCustomer, context(null));

		expect(linkConversationCustomer).not.toHaveBeenCalled();
	});
});

describe("detectAccessMedium", () => {
	it("reads the interface, then the access point", () => {
		expect(
			detectAccessMedium({ mikrotikInterface: "vlan20-olt1-PON4" }),
		).toBe("fiber (OLT/PON)");
		expect(detectAccessMedium({ mikrotikInterface: "ether5-zone2" })).toBe(
			"ethernet",
		);
		expect(
			detectAccessMedium({
				mikrotikInterface: "wlan-sector3",
				accessPointName: "AP-Batroun-3",
			}),
		).toBe("wireless (access point)");
		expect(detectAccessMedium({})).toBeNull();
	});
});

describe("diagnosis wording", () => {
	it("never tells the customer to contact their ISP — we are the ISP", () => {
		const cases = [
			{ accountStatus: "BLOCKED", accountActive: false, online: false },
			{ accountStatus: "DISABLED", accountActive: false, online: false },
			{
				accountStatus: "Active",
				accountActive: true,
				online: true,
				fupMode: "1",
			},
			{
				accountStatus: "Active",
				accountActive: true,
				online: false,
				accessPointOnline: false,
			},
			{
				accountStatus: "Active",
				accountActive: true,
				online: false,
				stationOnline: false,
			},
			{ accountStatus: "Active", accountActive: true, online: false },
			{
				accountStatus: "Active",
				accountActive: true,
				online: true,
				pingStatus: "healthy" as const,
			},
		];
		for (const c of cases) {
			const d = buildDiagnosis({
				fupMode: "0",
				accessPointOnline: null,
				stationOnline: null,
				connectionType: "wireless",
				pingStatus: "unknown",
				bandwidthStatus: null,
				neighborResults: [],
				...c,
			});
			expect(d.actionNeeded).not.toMatch(/your ISP/i);
		}
	});

	it("points a healthy line at the on-net speed test", () => {
		const d = buildDiagnosis({
			accountStatus: "Active",
			accountActive: true,
			online: true,
			fupMode: "0",
			accessPointOnline: true,
			stationOnline: true,
			connectionType: "fiber",
			pingStatus: "healthy",
			bandwidthStatus: "idle",
			neighborResults: [],
		});
		expect(d.actionNeeded).toBe(
			"Ask for a speed test on speedtest.libancomlb.com (on-net: it should read far above the plan speed; a low result points at the router/Wi-Fi).",
		);
	});
});
